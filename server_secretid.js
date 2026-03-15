const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
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

// SEM VLOŽÍŠ TO ID, KTERÉ UVIDÍŠ V LOGU NA RENDEROVI
const ADMIN_IDS = ["781859398183944192"];

app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'lssd-secret-key',
    resave: false, 
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findOne({ id: id });
    done(null, user);
});

// Discord Strategy - s opraveným scope
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/discord/callback",
    scope: ['identify']
}, async (at, rt, profile, done) => {
    console.log("--- PŘIHLÁŠEN DISCORD ID: " + profile.id + " ---");
    let user = await User.findOne({ id: profile.id });
    if (!user) user = await User.create({ id: profile.id, displayName: profile.username });
    return done(null, user);
}));

app.use((req, res, next) => {
    if (req.isAuthenticated()) req.isAdmin = ADMIN_IDS.includes(req.user.id);
    next();
});

// CESTY (Routes)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Oprava pro přímý přístup k index.html (třeba při odhlášení)
app.get('/index.html', (req, res) => res.redirect('/'));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { 
    successRedirect: '/dashboard.html', 
    failureRedirect: '/' 
}));

app.get('/dashboard.html', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    if (req.isAdmin) return res.sendFile(path.join(__dirname, 'dashboard.html'));
    if (!req.user.approved) return res.send("Čekej na schválení adminem.");
    if (!req.user.password) return res.sendFile(path.join(__dirname, 'set-password.html'));
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Opravená cesta pro odhlášení
app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server běží na portu ${PORT}`));
