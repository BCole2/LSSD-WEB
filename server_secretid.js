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
const ADMIN_IDS = ["781859398183944192"]; // SEM VLOŽ SVOJE DISCORD ID
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

// --- MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'lssd-secret', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

// --- DISCORD STRATEGIE ---
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

// --- CESTY ---
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect(req.user.approved ? '/dashboard' : '/prihlaska');
});

// Registrace hesla pro hru (po schválení)
app.post('/register-game-account', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Přihlas se!");
    const { icName, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(req.user.id, { icName, password: hash });
    res.send("<h1>Účet vytvořen!</h1>");
});

// Admin schválení s odesláním PM
app.post('/api/admin/approve/:id', async (req, res) => {
    if (!ADMIN_IDS.includes(req.user.discordId)) return res.status(403).send("Jen pro adminy!");
    const app = await Application.findById(req.params.id);
    
    // Odeslání PM přes Discord bota
    try {
        const user = await bot.users.fetch(app.userId);
        await user.send(`Gratuluji, tvoje přihláška byla schválena. Nyní se přihlas na webu a nastav si heslo.`);
    } catch (e) { console.error(e); }
    
    app.status = 'approved';
    await app.save();
    res.json({ success: true });
});

// Servírování souborů
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/prihlaska', (req, res) => res.isAuthenticated() ? res.sendFile(path.join(__dirname, 'prihlaska.html')) : res.redirect('/'));
app.get('/dashboard', (req, res) => (req.isAuthenticated() && ADMIN_IDS.includes(req.user.discordId)) ? res.sendFile(path.join(__dirname, 'dashboard.html')) : res.redirect('/'));

app.listen(10000);
