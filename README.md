# Apple-Music-To-Spotify-
A full-stack web application that allows users to transfer playlists from **Apple Music** to **Spotify**.  
The app uses Apple MusicKit and the Spotify Web API to authenticate users, fetch playlists, and migrate selected playlists across platforms. Unfornately to run the application needs an apple developper account and an active spotify subscription. These are needed to configure the env variables.

# Setup Instructions
### 1 . Clone The repository
### 2 . Configure env variables
### 3. Run backend server

# Authentication Flow
### Apple Music
1. User clicks Login to Apple Music
2. MusicKit authorizes user
3. App receives musicUserToken
4. Token is used to fetch playlists

### Spotify
1. User clicks Login to Spotify
2. OAuth popup opens
3. Backend handles authorization
4. Access token is sent back via postMessage
5. Token is stored in localStorage
   
### Playlist Transfer Flow 
1. User logs into Apple Music
2. Playlists are fetched and displayed
3. User selects playlists
4. User logs into Spotify
5. User clicks Transfer
  Backend:
    Reads Apple Music playlists
    Searches Spotify tracks
    Creates playlists in Spotify
6. Frontend displays transfer summary 
