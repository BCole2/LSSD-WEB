const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const { Client, GatewayIntentBits } = require('discord.js');
const path = require('path');

const app = express();
const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// --- KONFIGURACE ---
const ADMIN_IDS = ["TVOJE_DISCORD_ID"];
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

// --- MIDDLEWARE (SESSION V MONGODB) ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'lssd-super-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}));
app.use(passport.initialize());
app.use(passport.session());

// --- PASSPORT LOGIKA ---
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

// --- API CESTY ---
app.post('/submit-application', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Nejdříve se přihlas!");
    await Application.create({ userId: req.user.id, discordTag: req.user.discordId, icName: req.body.icName, data: req.body });
    res.send("<h1>Přihláška odeslána!</h1><a href='/'>Zpět na hlavní stránku</a>");
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    // Po přihlášení přes Discord jdi rovnou na nábor
    res.redirect('/prihlaska');
});

// --- STATICKÉ SOUBORY ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/prihlaska', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'prihlaska.html')) : res.redirect('/'));
app.get('/dashboard', (req, res) => (req.isAuthenticated() && ADMIN_IDS.includes(req.user.discordId)) ? res.sendFile(path.join(__dirname, 'dashboard.html')) : res.redirect('/'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

app.listen(10000, () => console.log('Server běží na portu 10000'));
