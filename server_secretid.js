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

// --- 1. KONFIGURACE A PŘIPOJENÍ ---
const ADMIN_IDS = ["TVOJE_DISCORD_ID"];
mongoose.connect(process.env.MONGO_URI);
bot.login(process.env.DISCORD_BOT_TOKEN);

// --- 2. SCHÉMATA ---
const User = mongoose.model('User', new mongoose.Schema({ 
    discordId: { type: String, unique: true },
    icName: String,
    password: { type: String, select: false },
    approved: { type: Boolean, default: false }
}));

const Application = mongoose.model('Application', new mongoose.Schema({
    userId: String, discordTag: String, icName: String, status: { type: String, default: 'pending' }, data: Object
}));

// --- 3. MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'lssd-secret', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// --- 4. REGISTRACE DISCORD STRATEGIE (Zde musí být pod Passport middleware!) ---
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: "https://lssd-web.onrender.com/auth/discord/callback",
    scope: ['identify']
}, async (at, rt, profile, done) => {
    try {
        let user = await User.findOne({ discordId: profile.id });
        if (!user) user = await User.create({ discordId: profile.id });
        return done(null, user);
    } catch (e) { return done(e); }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});

// --- 5. API A POST CESTY ---
app.post('/submit-application', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Nejdříve se přihlas!");
    await Application.create({ userId: req.user.id, discordTag: req.user.discordId, icName: req.body.icName, data: req.body });
    res.send("<h1>Přihláška odeslána!</h1><a href='/'>Zpět</a>");
});

app.post('/register-game-account', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Přihlas se!");
    const hash = await bcrypt.hash(req.body.password, 10);
    await User.findByIdAndUpdate(req.user.id, { icName: req.body.icName, password: hash, approved: true });
    res.send("<h1>Účet vytvořen!</h1>");
});

// --- 6. AUTH A OSTATNÍ GET CESTY ---
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect(req.user.approved ? '/dashboard' : '/prihlaska');
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/prihlaska', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'prihlaska.html')) : res.redirect('/'));
app.get('/dashboard', (req, res) => (req.isAuthenticated() && ADMIN_IDS.includes(req.user.discordId)) ? res.sendFile(path.join(__dirname, 'dashboard.html')) : res.redirect('/'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

app.listen(10000, () => console.log('Server běží na portu 10000'));
