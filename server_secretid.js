const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const path = require('path');
const app = express();

// 1. PŘIPOJENÍ K DB
mongoose.connect(process.env.MONGO_URI);

// Modely
const UserSchema = new mongoose.Schema({
    id: String,
    displayName: String,
    icName: { type: String, default: "" },
    password: { type: String, default: null },
    approved: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

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
    status: { type: String, default: 'pending' }
});
const Application = mongoose.model('Application', ApplicationSchema);

const ADMIN_IDS = ["781859398183944192"]; // <-- Zde si vlož své ID

// MIDDLEWARE
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'lssd-secret',
    resave: false, saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// STRATEGIE
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

app.use((req, res, next) => {
    if (req.isAuthenticated()) req.isAdmin = ADMIN_IDS.includes(req.user.id);
    next();
});

// CESTY
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { successRedirect: '/check-status', failureRedirect: '/' }));

// ZDE JE TA CESTA, KTEROU JSI CHTĚL
app.get('/dashboard.html', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Logika pro kontrolu stavu (zda vyplnit formulář, nebo jít do dashboardu)
app.get('/check-status', (req, res) => {
    if (req.isAdmin || (req.user && req.user.approved)) return res.redirect('/dashboard.html');
    res.redirect('/prihlaska');
});

app.get('/prihlaska', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'prihlaska.html'));
});

app.post('/submit-application', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Přihlas se!");
    await Application.create({ userId: req.user.id, discordTag: req.user.displayName, ...req.body });
    res.send("<h1>Odesláno! Sleduj Discord.</h1><a href='/'>Zpět</a>");
});

// API PRO ADMINA
app.get('/api/admin/applications', async (req, res) => {
    if (!req.isAdmin) return res.status(403).send("Forbidden");
    const apps = await Application.find({ status: 'pending' });
    res.json(apps);
});

app.post('/api/admin/approve/:id', async (req, res) => {
    if (!req.isAdmin) return res.status(403).send("Forbidden");
    const appData = await Application.findById(req.params.id);
    if (appData) {
        await User.findOneAndUpdate({ id: appData.userId }, { approved: true, icName: appData.icName });
        appData.status = 'approved';
        await appData.save();
        res.json({ success: true });
    }
});

app.get('/logout', (req, res) => { req.logout(() => res.redirect('/')); });

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server běží na ${PORT}`));
