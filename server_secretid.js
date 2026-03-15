const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const path = require('path');
const app = express();

// --- 1. KONFIGURACE ---
mongoose.connect(process.env.MONGO_URI).then(() => console.log("DB Připojena"));

const UserSchema = new mongoose.Schema({
    id: String,
    displayName: String,
    icName: String,
    icQuestions: Object,
    password: { type: String, default: null },
    approved: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

// Admin ID - SEM POZDĚJI VLOŽÍŠ TO ČÍSLO, KTERÉ TI VYPADNE Z LOGŮ
const ADMIN_IDS = ["781859398183944192"];

app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false, saveUninitialized: false, proxy: true,
    name: 'lssd_sid',
    cookie: { secure: true, httpOnly: true, sameSite: 'none' }
}));

app.use(passport.initialize());
app.use(passport.session());

// --- 2. PASSPORT & ADMIN MIDDLEWARE ---
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
    // Tady uvidíš ID v logu, až se přihlásíš
    console.log("--- PŘIHLÁŠEN UŽIVATEL ID: " + profile.id + " ---");
    let user = await User.findOne({ id: profile.id });
    if (!user) user = await User.create({ id: profile.id, displayName: profile.username });
    return done(null, user);
}));

app.use((req, res, next) => {
    if (req.isAuthenticated()) req.isAdmin = ADMIN_IDS.includes(req.user.id);
    next();
});

// --- 3. CESTY ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/dashboard.html');
});

// Nábor
app.get('/apply', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'apply.html')) : res.redirect('/'));
app.post('/submit-application', async (req, res) => {
    await User.findOneAndUpdate({ id: req.user.id }, { icName: req.body.icName, icQuestions: req.body });
    res.send('Přihláška odeslána. <a href="/logout">Odhlásit</a>');
});

// Admin panel
app.get('/admin-panel-secret', async (req, res) => {
    if (!req.isAdmin) return res.status(403).send("Přístup odepřen.");
    const pending = await User.find({ approved: false, icName: { $exists: true } });
    let html = `<h1>Admin Panel - Čekající</h1>`;
    pending.forEach(u => {
        html += `<form action="/admin/approve" method="POST"><p>${u.displayName} (${u.icName})</p>
                 <input type="hidden" name="id" value="${u.id}"><button type="submit">Schválit</button></form>`;
    });
    res.send(html);
});

app.post('/admin/approve', async (req, res) => {
    await User.findOneAndUpdate({ id: req.body.id }, { approved: true });
    res.redirect('/admin-panel-secret');
});

// Dashboard & Heslo
app.get('/dashboard.html', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    if (req.isAdmin) return res.sendFile(path.join(__dirname, 'dashboard.html'));
    if (!req.user.approved) return res.redirect('/apply');
    if (!req.user.password) return res.sendFile(path.join(__dirname, 'set-password.html'));
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.post('/set-password', async (req, res) => {
    await User.findOneAndUpdate({ id: req.user.id }, { password: req.body.password });
    res.redirect('/dashboard.html');
});

app.get('/logout', (req, res) => { req.logout(() => { req.session.destroy(() => res.redirect('/')); }); });

app.listen(process.env.PORT || 10000);
