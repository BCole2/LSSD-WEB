const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const path = require('path');
const app = express();

// 1. PŘIPOJENÍ K DATABÁZI
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("DB Připojena"))
    .catch(err => console.error("Chyba DB:", err));

const UserSchema = new mongoose.Schema({
    id: String,
    displayName: String,
    icName: String,
    password: { type: String, default: null },
    approved: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

// TVOJE ID - ZDE VLOŽ SVÉ DISCORD ID, AŽ HO NAJDEŠ V LOGU
const ADMIN_IDS = ["TVOJE_ID_Z_DISCORDU"];

app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET || 'super-tajne-heslo',
    resave: false, saveUninitialized: false,
    cookie: { secure: false } // Pro lokální testy false, na Renderu může být true
}));

app.use(passport.initialize());
app.use(passport.session());

// 2. PASSPORT DISCORD
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
    console.log("--- PŘIHLÁŠEN UŽIVATEL ID: " + profile.id + " ---");
    let user = await User.findOne({ id: profile.id });
    if (!user) user = await User.create({ id: profile.id, displayName: profile.username });
    return done(null, user);
}));

app.use((req, res, next) => {
    if (req.isAuthenticated()) req.isAdmin = ADMIN_IDS.includes(req.user.id);
    next();
});

// 3. CESTY
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard.html'));

app.get('/dashboard.html', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    if (req.isAdmin) return res.sendFile(path.join(__dirname, 'dashboard.html'));
    if (!req.user.approved) return res.send("Čekej na schválení adminem.");
    if (!req.user.password) return res.sendFile(path.join(__dirname, 'set-password.html'));
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// 4. SPUŠTĚNÍ SERVERU (TADY JE TO DŮLEŽITÉ PRO RENDER)
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server běží na portu ${PORT}`);
});
