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

// SEM VLOŽÍŠ TO ID, KTERÉ TI VYPIŠE KONZOLE (viz níže)
const ADMIN_IDS = ["781859398183944192"];

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'tajne-heslo',
    resave: false, saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findOne({ id: id });
    done(null, user);
});

// OPRAVA: Přidán 'identify' scope pro Discord
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/discord/callback",
    scope: ['identify'] // TADY BYLA TA CHYBA Z OBRÁZKU
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

app.use((req, res, next) => {
    if (req.isAuthenticated()) req.isAdmin = ADMIN_IDS.includes(req.user.id);
    next();
});

// CESTY
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { successRedirect: '/dashboard.html', failureRedirect: '/' }));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { successRedirect: '/dashboard.html', failureRedirect: '/' }));

app.get('/dashboard.html', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    
    // Pokud jsi v seznamu ADMIN_IDS, pustí tě to HNED
    if (req.isAdmin) return res.sendFile(path.join(__dirname, 'dashboard.html'));

    // Ostatní musí čekat na schválení
    if (!req.user.approved) return res.send("Čekej na schválení od admina (toho, kdo má nastavené ADMIN_IDS).");
    
    if (!req.user.password) return res.sendFile(path.join(__dirname, 'set-password.html'));
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server běží na portu ${PORT}`));
