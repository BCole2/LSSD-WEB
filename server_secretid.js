const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose = require('mongoose');
const path = require('path');
const app = express();

// 1. PŘIPOJENÍ K DB
mongoose.connect(process.env.MONGO_URI);

const UserSchema = new mongoose.Schema({
    id: String,
    provider: String, // 'discord' nebo 'google'
    displayName: String,
    icName: String,
    password: { type: String, default: null },
    approved: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

// TVOJE ID (vlož sem ID, které uvidíš v logu po přihlášení)
const ADMIN_IDS = ["TVOJE_ID_Z_DISCORDU_NEBO_GOOGLE"];

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'tajne-heslo',
    resave: false, saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// 2. STRATEGIE (DISCORD + GOOGLE)
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findOne({ id: id });
    done(null, user);
});

// Discord
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/discord/callback"
}, async (at, rt, profile, done) => {
    console.log("--- PŘIHLÁŠEN DISCORD ID: " + profile.id + " ---");
    let user = await User.findOne({ id: profile.id });
    if (!user) user = await User.create({ id: profile.id, provider: 'discord', displayName: profile.username });
    return done(null, user);
}));

// Google
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/google/callback"
}, async (at, rt, profile, done) => {
    console.log("--- PŘIHLÁŠEN GOOGLE ID: " + profile.id + " ---");
    let user = await User.findOne({ id: profile.id });
    if (!user) user = await User.create({ id: profile.id, provider: 'google', displayName: profile.displayName });
    return done(null, user);
}));

// 3. MIDDLEWARE
app.use((req, res, next) => {
    if (req.isAuthenticated()) req.isAdmin = ADMIN_IDS.includes(req.user.id);
    next();
});

// 4. CESTY
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { successRedirect: '/dashboard.html', failureRedirect: '/' }));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));
app.get('/auth/google/callback', passport.authenticate('google', { successRedirect: '/dashboard.html', failureRedirect: '/' }));

app.get('/dashboard.html', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    if (req.isAdmin) return res.sendFile(path.join(__dirname, 'dashboard.html'));
    if (!req.user.approved) return res.send("Čekej na schválení.");
    if (!req.user.password) return res.sendFile(path.join(__dirname, 'set-password.html'));
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// 5. SPUŠTĚNÍ
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server běží na ${PORT}`));
