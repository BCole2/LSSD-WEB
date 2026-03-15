const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose = require('mongoose');
const path = require('path');
const app = express();

// Připojení k DB
mongoose.connect(process.env.MONGO_URI);

const UserSchema = new mongoose.Schema({
    id: String,
    displayName: String,
    icName: String,
    password: { type: String, default: null },
    approved: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

// TVOJE ID (doplň sem ID z logů po přihlášení)
const ADMIN_IDS = ["TVOJE_ID_Z_LOGU"];

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'tajne-heslo-123',
    resave: false, saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport nastavení
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findOne({ id: id });
    done(null, user);
});

// Discord Strategy
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/discord/callback"
}, async (at, rt, profile, done) => {
    console.log("--- PŘIHLÁŠEN DISCORD ID: " + profile.id + " ---");
    let user = await User.findOne({ id: profile.id });
    if (!user) user = await User.create({ id: profile.id, displayName: profile.username });
    return done(null, user);
}));

// Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/google/callback"
}, async (at, rt, profile, done) => {
    console.log("--- PŘIHLÁŠEN GOOGLE ID: " + profile.id + " ---");
    let user = await User.findOne({ id: profile.id });
    if (!user) user = await User.create({ id: profile.id, displayName: profile.displayName });
    return done(null, user);
}));

// Middleware pro Admina
app.use((req, res, next) => {
    if (req.isAuthenticated()) req.isAdmin = ADMIN_IDS.includes(req.user.id);
    next();
});

// Cesty
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { successRedirect: '/dashboard.html', failureRedirect: '/' }));
app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));
app.get('/auth/google/callback', passport.authenticate('google', { successRedirect: '/dashboard.html', failureRedirect: '/' }));

app.get('/dashboard.html', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    if (req.isAdmin) return res.sendFile(path.join(__dirname, 'dashboard.html'));
    if (!req.user.approved) return res.send("Čekej na schválení adminem.");
    if (!req.user.password) return res.sendFile(path.join(__dirname, 'set-password.html'));
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// SPUŠTĚNÍ
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server běží na portu ${PORT}`));
