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

// --- KONFIGURACE ---
const ADMIN_IDS = ["TVOJE_DISCORD_ID"]; // ZDE VLOŽ SVÉ ID
mongoose.connect(process.env.MONGO_URI);
bot.login(process.env.DISCORD_BOT_TOKEN);

// --- SCHÉMATA ---
const User = mongoose.model('User', new mongoose.Schema({ 
    discordId: { type: String, unique: true },
    icName: String,
    password: { type: String, select: false },
    approved: { type: Boolean, default: false }
}));

const Application = mongoose.model('Application', new mongoose.Schema({
    userId: String, discordTag: String, icName: String, status: { type: String, default: 'pending' }, data: Object
}));

// --- MIDDLEWARE (POŘADÍ JE KLÍČOVÉ) ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'lssd-secret', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// --- 1. API CESTY (MUSÍ BÝT PŘED STATICKÝMI SOUBORY) ---
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect(req.user.approved ? '/dashboard' : '/prihlaska');
});

app.post('/submit-application', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Nejdříve se přihlas!");
    await Application.create({ userId: req.user.id, discordTag: req.user.discordId, icName: req.body.icName, data: req.body });
    res.send("<h1>Přihláška odeslána!</h1><a href='/dashboard'>Zpět</a>");
});

app.post('/register-game-account', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Přihlas se!");
    const hash = await bcrypt.hash(req.body.password, 10);
    await User.findByIdAndUpdate(req.user.id, { icName: req.body.icName, password: hash, approved: true });
    res.send("<h1>Účet vytvořen!</h1>");
});

app.post('/api/admin/approve/:id', async (req, res) => {
    if (!req.isAuthenticated() || !ADMIN_IDS.includes(req.user.discordId)) return res.status(403).send("Přístup odepřen!");
    const appData = await Application.findById(req.params.id);
    try {
        const user = await bot.users.fetch(appData.userId);
        await user.send(`Gratuluji, tvoje přihláška k LSSD byla schválena! Registruj se zde: https://lssd-web.onrender.com/register`);
    } catch (e) { console.error("PM chyba:", e); }
    appData.status = 'approved';
    await appData.save();
    res.json({ success: true });
});

// --- 2. STATICKÉ CESTY ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/prihlaska', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'prihlaska.html')) : res.redirect('/'));
app.get('/dashboard', (req, res) => (req.isAuthenticated() && ADMIN_IDS.includes(req.user.discordId)) ? res.sendFile(path.join(__dirname, 'dashboard.html')) : res.redirect('/'));
app.get('/register', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'register.html')) : res.redirect('/'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

// --- 3. START SERVERU ---
app.listen(10000, () => console.log('Server běží na portu 10000'));
