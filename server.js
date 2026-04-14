//Load environement virables from .env file
import dotenv from "dotenv";
dotenv.config();

//Import required libraries
import express from "express";
import cors from "cors";
import axios from "axios";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import open from "open";
import { fileURLToPath } from "url";
import { dirname } from "path";

//Setup __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

//Serve static files (index.html)
app.use(express.static(path.join(__dirname)));

//Enable JSON request body parsing
app.use(express.json());

//Enables CORS (Cross-Origin ressource sharing)
app.use(cors());

//
app.use(express.static("public"));

//Spotify Authenthication using 0Auth 2.0
/**
 * Route: /login/spotify
 * Description: Redirects user to Spotify's authrization page to begin OAuth
 */
app.get("/login/spotify", (req, res) => {
  const scope = "playlist-modify-public playlist-modify-private";

  const authURL =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: process.env.SPOTIFY_CLIENT_ID,
      scope: scope,
      redirect_uri: "http://127.0.0.1:3000/callback",
    });

  res.redirect(authURL.toString());
});

// function to generate apple developer token
function generateDeveloperToken() {
  const privateKey = fs.readFileSync(
    path.resolve(__dirname, process.env.APPLE_MUSIC_PRIVATE_KEY_PATH),
    "utf8",
  );

  return jwt.sign({}, privateKey, {
    algorithm: "ES256",
    expiresIn: "180d",
    keyid: process.env.APPLE_MUSIC_KEY_ID,
    issuer: process.env.APPLE_MUSIC_TEAM_ID,
  });
}
/**
 * Route: /callback
 * Description: After user authenthication, Spotify will redirect here. Exchanges authenthication code for access token
 */

app.get("/callback", async (req, res) => {
  const code = req.query.code;

  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: "http://127.0.0.1:3000/callback",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(
              process.env.SPOTIFY_CLIENT_ID +
                ":" +
                process.env.SPOTIFY_CLIENT_SECRET,
            ).toString("base64"),
        },
      },
    );

    const accessToken = response.data.access_token;

    res.send(`
      <script>
        window.opener.postMessage(
          { type: "spotify-token", token: "${accessToken}" },
          "http://127.0.0.1:3000"
        );
        window.close();
      </script>
    `);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.send("Spotify login failed");
  }
});
/**
 * Route: /login/apple
 * Description: Generates an Apple Music developer token using private key
 */
app.get("/login/apple", (req, res) => {
  try {
    const token = generateDeveloperToken();
    res.json({ developer_token: token });
  } catch (error) {
    console.error("Error generating Apple Music token:", error.message);
    res.status(500).json({ error: "Failed to generate Apple Music token" });
  }
});

app.get("/apple/playlists", async (req, res) => {
  const userToken = req.headers["music-user-token"];
  if (!userToken) {
    return res.status(400).json({ error: "Missing Apple Music user token" });
  }

  const devToken = await generateDeveloperToken();

  if (!userToken) {
    return res.status(400).json({ error: "Missing user token" });
  }

  try {
    const response = await axios.get(
      "https://api.music.apple.com/v1/me/library/playlists",
      {
        headers: {
          Authorization: `Bearer ${devToken}`,
          "Music-User-Token": userToken,
        },
      },
    );

    res.json(response.data);
  } catch (error) {
    console.error(
      "Failed to fetch Apple Music Playlist:",
      error.response?.data || error.message,
    );
    res.status(500).json({ error: "Failed to fetch playlists" });
  }
});

// Transfer logic
app.post("/transfer", async (req, res) => {
  const spotifyToken = req.headers.authorization?.split(" ")[1];
  const userToken = req.headers["music-user-token"];
  const playlistIds = req.body.playlistIds || [];

  if (playlistIds.length === 0) {
    return res.status(400).json({ error: "No playlists selected" });
  }

  if (!userToken) {
    return res.status(400).json({ error: "Missing Apple Music user token" });
  }

  const devToken = generateDeveloperToken();

  let success = 0;
  let errors = [];
  let details = [];

  try {
    // Get Spotify user ID
    const meRes = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${spotifyToken}` },
    });

    const userId = meRes.data.id;

    // Loop through selected playlists
    for (const playlistId of playlistIds) {
      let failedTracks = [];

      try {
        const playlistRes = await axios.get(
          `https://api.music.apple.com/v1/me/library/playlists/${playlistId}`,
          {
            headers: {
              Authorization: `Bearer ${devToken}`,
              "Music-User-Token": userToken,
            },
          },
        );

        const applePlaylist = playlistRes.data.data[0];
        const playlistName = applePlaylist.attributes.name;

        // Get tracks URL
        const tracksUrl = applePlaylist.relationships?.tracks?.href;

        let appleTracks = [];

        if (tracksUrl) {
          const tracksRes = await axios.get(tracksUrl, {
            headers: {
              Authorization: `Bearer ${devToken}`,
              "Music-User-Token": userToken,
            },
          });

          appleTracks = tracksRes.data.data || [];
        }

        // Search tracks on Spotify
        let spotifyUris = [];

        for (const track of appleTracks) {
          const song = track.attributes?.name;
          const artist = track.attributes?.artistName;

          if (!song || !artist) continue;

          try {
            const query = `track:"${song}" artist:"${artist}"`;

            const searchRes = await axios.get(
              `https://api.spotify.com/v1/search?q=${encodeURIComponent(
                query,
              )}&type=track&limit=1`,
              {
                headers: {
                  Authorization: `Bearer ${spotifyToken}`,
                },
              },
            );

            const found = searchRes.data.tracks.items[0];

            if (found) {
              spotifyUris.push(found.uri);
            } else {
              failedTracks.push({ song, artist });
            }
          } catch {
            failedTracks.push({ song, artist });
          }
        }

        //  Create Spotify playlist
        const createRes = await axios.post(
          `https://api.spotify.com/v1/users/${userId}/playlists`,
          {
            name: playlistName,
            description: "Transferred from Apple Music",
            public: false,
          },
          {
            headers: {
              Authorization: `Bearer ${spotifyToken}`,
              "Content-Type": "application/json",
            },
          },
        );

        const spotifyPlaylistId = createRes.data.id;

        // Add tracks in batches of 100
        for (let i = 0; i < spotifyUris.length; i += 100) {
          const batch = spotifyUris.slice(i, i + 100);

          await axios.post(
            `https://api.spotify.com/v1/playlists/${spotifyPlaylistId}/tracks`,
            { uris: batch },
            {
              headers: {
                Authorization: `Bearer ${spotifyToken}`,
                "Content-Type": "application/json",
              },
            },
          );
        }

        success++;

        details.push({
          playlist: playlistName,
          failedTracks,
        });
      } catch (err) {
        errors.push(`Failed playlist ${playlistId}`);
      }
    }

    res.json({ success, errors, details });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Transfer failed" });
  }
});
//IMPORTANT Start the server on http://127.0.0.1:3000 !!! localhost:3000 no longer works with the new spotify developper requirements
app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
