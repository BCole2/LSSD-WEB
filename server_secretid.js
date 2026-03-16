const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const path = require('path');
const app = express();

// --- PŘIPOJENÍ A KONFIGURACE ---
mongoose.connect(process.env.MONGO_URI);

const UserSchema = new mongoose.Schema({ id: String, displayName: String, icName: String, approved: { type: Boolean, default: false } });
const User = mongoose.model('User', UserSchema);

const ApplicationSchema = new mongoose.Schema({
    userId: String, discordTag: String, oocName: String, age: Number, availability: String,
    fivemExp: String, prevServers: String, rpExp: String, policeExp: String, reason: String,
    rpStyle: String, area: String, specialization: [String], scenarios: String, conflicts: String,
    icName: String, icAge: Number, story: String, motivation: String, skills: String, attachments: String,
    status: { type: String, default: 'pending' }
});
const Application = mongoose.model('Application', ApplicationSchema);

const ADMIN_IDS = ["781859398183944192"]; // ZDE VLOŽ SVÉ ID

// --- MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'lssd-secret', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// --- AUTHENTIKACE ---
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => done(null, await User.findOne({ id })));

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

// --- CESTY ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { successRedirect: '/check-status', failureRedirect: '/' }));

app.get('/check-status', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    if (req.isAdmin || req.user.approved) return res.redirect('/dashboard.html');
    res.redirect('/prihlaska');
});

app.get('/prihlaska', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'prihlaska.html')) : res.redirect('/'));
app.get('/dashboard.html', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'dashboard.html')) : res.redirect('/'));

// API
app.post('/submit-application', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Neautorizováno");
    const data = { ...req.body, specialization: Array.isArray(req.body.specialization) ? req.body.specialization : [req.body.specialization] };
    await Application.create({ userId: req.user.id, discordTag: req.user.displayName, ...data });
    res.send("<h1>Přihláška odeslána!</h1><a href='/'>Zpět na hlavní stránku</a>");
});

app.get('/api/admin/applications', async (req, res) => {
    if (!req.isAdmin) return res.status(403).send("Forbidden");
    res.json(await Application.find({ status: 'pending' }));
});

app.post('/api/admin/approve/:id', async (req, res) => {
    if (!req.isAdmin) return res.status(403).send("Forbidden");
    const appData = await Application.findById(req.params.id);
    await User.findOneAndUpdate({ id: appData.userId }, { approved: true, icName: appData.icName });
    appData.status = 'approved';
    await appData.save();
    res.json({ success: true });
});

app.get('/logout', (req, res) => { req.logout(() => res.redirect('/')); });

app.listen(process.env.PORT || 10000, () => console.log('Server běží.'));
