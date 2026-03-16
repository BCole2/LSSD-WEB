const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');

const app = express();
const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// --- 1. KONFIGURACE A PROSTŘEDÍ ---
const ADMIN_IDS = ["TVOJE_DISCORD_ID"]; // ZDE VLOŽ SVÉ ID
mongoose.connect(process.env.MONGO_URI);
bot.login(process.env.DISCORD_BOT_TOKEN);

// --- 2. DATABÁZOVÁ SCHÉMATA ---
const User = mongoose.model('User', new mongoose.Schema({ 
    discordId: { type: String, unique: true },
    icName: String,
    password: { type: String, select: false },
    approved: { type: Boolean, default: false }
}));

const Application = mongoose.model('Application', new mongoose.Schema({
    userId: String, 
    discordTag: String, 
    icName: String, 
    status: { type: String, default: 'pending' }, 
    data: Object
}));

// --- 3. MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ 
    secret: 'lssd-secret-key-2026', 
    resave: false, 
    saveUninitialized: false 
}));
app.use(passport.initialize());
app.use(passport.session());

// --- 4. PASSPORT DISCORD STRATEGIE ---
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});

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

// --- 5. API A LOGIKA ---

// Autentizační brána
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect(req.user.approved ? '/dashboard' : '/prihlaska');
});

// Registrace hesla pro hru (po schválení)
app.post('/register-game-account', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Neautorizováno");
    try {
        const hash = await bcrypt.hash(req.body.password, 10);
        await User.findByIdAndUpdate(req.user.id, { icName: req.body.icName, password: hash, approved: true });
        res.send("<h1>Registrace dokončena!</h1><p>Nyní se můžete přihlásit do hry.</p>");
    } catch (err) { res.status(500).send("Chyba při registraci"); }
});

// Schvalování přihlášek s PM notifikací
app.post('/api/admin/approve/:id', async (req, res) => {
    if (!req.isAuthenticated() || !ADMIN_IDS.includes(req.user.discordId)) return res.status(403).send("Přístup odepřen!");
    
    try {
        const appData = await Application.findById(req.params.id);
        const user = await bot.users.fetch(appData.userId);
        await user.send(`Gratulujeme, tvoje přihláška k LSSD byla schválena! Nyní se přihlas na webu a dokonči registraci.`);
        
        appData.status = 'approved';
        await appData.save();
        res.json({ success: true });
    } catch (e) { res.status(500).send("Chyba při schvalování"); }
});

// --- 6. STATICKÉ STRÁNKY ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/prihlaska', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'prihlaska.html')) : res.redirect('/'));
app.get('/dashboard', (req, res) => {
    if (req.isAuthenticated() && ADMIN_IDS.includes(req.user.discordId)) {
        res.sendFile(path.join(__dirname, 'dashboard.html'));
    } else {
        res.redirect('/');
    }
});
app.get('/logout', (req, res) => { req.logout(() => res.redirect('/')); });

// --- 7. START SERVERU ---
app.listen(process.env.PORT || 10000, () => {
    console.log('Server LSSD 1.0 běží na portu 10000.');
});
