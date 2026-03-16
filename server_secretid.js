const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();

// --- 1. SCHÉMATA ---
const User = mongoose.model('User', new mongoose.Schema({ 
    discordId: { type: String, unique: true },
    icName: { type: String, unique: true },
    password: { type: String, select: false },
    approved: { type: Boolean, default: false }
}));

// --- 2. MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'lssd-2026-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}));
app.use(passport.initialize());
app.use(passport.session());

// --- 3. PASSPORT ---
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/discord/callback",
    scope: ['identify']
}, async (at, rt, profile, done) => {
    let user = await User.findOne({ discordId: profile.id });
    if (!user) user = await User.create({ discordId: profile.id });
    return done(null, user);
}));
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => done(null, await User.findById(id)));

// --- 4. CESTY ---
app.post('/login', async (req, res) => {
    const { icName, password } = req.body;
    const user = await User.findOne({ icName }).select('+password');
    if (user && user.password && await bcrypt.compare(password, user.password)) {
        req.login(user, () => res.redirect('/dashboard'));
    } else { res.send("Špatné údaje."); }
});

app.post('/set-password', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');
    const hash = await bcrypt.hash(req.body.password, 10);
    await User.findByIdAndUpdate(req.user.id, { password: hash });
    res.send("Heslo nastaveno! <a href='/dashboard'>Vstoupit</a>");
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/prihlaska'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/prihlaska', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'prihlaska.html')) : res.redirect('/'));
app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');
    if (!req.user.password) return res.send("<h1>Nastav si heslo:</h1><form action='/set-password' method='POST'><input type='password' name='password' required><button>Uložit</button></form>");
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// --- 5. START SERVERU S KONTROLOU DB ---
const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB připojeno.");
        app.listen(10000, () => console.log("Server běží na portu 10000"));
    } catch (err) {
        console.error("Chyba DB:", err);
    }
};
startServer();
