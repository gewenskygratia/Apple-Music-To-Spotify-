// Initiliazing packages that will be used
let cors = require("cors");
let express = require("express");
let app = express();
let request = require("request");

const { URLSearchParams } = require("url");

//Initlizaing varaibles that will be sent to Spotify
let redirect_uri_login = "https://localhost:8888/callback";
let clientId = process.env.CLIENT_ID;
let clientSecret = process.env.CLIENT_SECRET;

app.use(cors());

// Login end point
app.get("/login", function (req, res) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "user-read-private user-read-email user-library-read",
    redirect_uri: redirect_uri_login,
  });
  res.redirect("https://accounts.spotify.com/authorize?" + params.toString());
});

//Creating callback end point
app.get("/callback", function (req, res) {
  let code = req.query.code || null;
  let authOptions = {
    url: "https://accounts.spotify.com/api/token",
    form: {
      code: code,
      redirect_uri: redirect_uri_login,
      grant_type: "authorization_code",
    },
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(clientId + ":" + clientSecret).toString("base64"),
    },
    json: true,
  };
  request.post(authOptions, function (error, response, body) {
    var access_token = body.access_token;
    let uri = process.env.FRONTEND_URI || "http://localhost:3000/playlist";

    res.redirect(uri + "?access_token=" + access_token);
  });
});

// Generate apple music token
const jwt = require("jsonwebtoken");
const fs = require("fs");

const private_key = fs.readFileSync("AuthKey_F485C9A8TL.p8").toString();
const team_id = "";
const key_id = "";
const token = jwt.sign({}, private_key, {
  algorithm: "ES256",
  expiresIn: "180d",
  issuer: team_id,
  header: {
    alg: "ES256",
    kid: key_id,
  },
});

const token_key = "";
app.get("/token", function (req, res) {
  if (req.query.key === token_key) {
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify({ token: token }));
  }
});

let port = process.env.PORT || 8888;
console.log(
  `Listening on port ${port}. Go /login to initiate authentication flow.`
);
app.listen(port);
