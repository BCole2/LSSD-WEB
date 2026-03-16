const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const path = require('path');
const app = express();

// 1. PŘIPOJENÍ K DATABÁZI
mongoose.connect(process.env.MONGO_URI);

// Model pro Uživatele
const UserSchema = new mongoose.Schema({
    id: String,
    displayName: String,
    icName: { type: String, default: "" },
    password: { type: String, default: null },
    approved: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

// Model pro Přihlášky
const ApplicationSchema = new mongoose.Schema({
    userId: String,
    discordTag: String,
    oocName: String,
    age: Number,
    availability: String,
    fivemExp: String,
    rpExp: String,
    reason: String,
    icName: String,
    icAge: Number,
    story: String,
    status: { type: String, default: 'pending' } // pending / approved / rejected
});
const Application = mongoose.model('Application', ApplicationSchema);

// TVOJE ID (Vlož sem své Discord ID)
const ADMIN_IDS = ["TVOJE_ID_Z_LOGU"];

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'lssd-secret',
    resave: false, saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findOne({ id: id });
    done(null, user);
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/discord/callback",
    scope: ['identify']
}, async (at, rt, profile, done) => {
    let user = await User.findOne({ id: profile.id });
    if (!user) user = await User.create({ id: profile.id, displayName: profile.username });
    return done(null, user);
}));

// MIDDLEWARE
app.use((req, res, next) => {
    if (req.isAuthenticated()) req.isAdmin = ADMIN_IDS.includes(req.user.id);
    next();
});

// CESTY - NÁBOR
app.get('/prihlaska', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    res.sendFile(path.join(__dirname, 'prihlaska.html'));
});

app.post('/submit-application', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Neautorizováno");
    await Application.create({
        userId: req.user.id,
        discordTag: req.user.displayName,
        ...req.body
    });
    res.send("<h1>Přihláška odeslána! Ozveme se ti na Discordu.</h1><a href='/'>Zpět</a>");
});

// CESTY - ADMIN (Pro tvůj Dashboard)
app.get('/api/admin/applications', async (req, res) => {
    if (!req.isAdmin) return res.status(403).send("Forbidden");
    const apps = await Application.find({ status: 'pending' });
    res.json(apps);
});

app.post('/api/admin/approve/:id', async (req, res) => {
    if (!req.isAdmin) return res.status(403).send("Forbidden");
    const appData = await Application.findById(req.params.id);
    if (appData) {
        // Schválíme uživatele v systému
        await User.findOneAndUpdate(
            { id: appData.userId },
            { approved: true, icName: appData.icName }
        );
        appData.status = 'approved';
        await appData.save();
        res.json({ success: true });
    }
});

// CESTY - ZÁKLADNÍ
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { successRedirect: '/check-status', failureRedirect: '/' }));

app.get('/check-status', (req, res) => {
    if (req.isAdmin) return res.redirect('/dashboard.html');
    if (req.user.approved) return res.redirect('/dashboard.html');
    res.redirect('/prihlaska');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Běžíme na ${PORT}`));
