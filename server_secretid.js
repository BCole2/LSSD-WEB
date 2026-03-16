const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const mongoose = require('mongoose');
const { Client, GatewayIntentBits } = require('discord.js');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// --- KONFIGURACE A ADMINI ---
const ADMIN_IDS = ["781859398183944192"]; // ZDE VLOŽ SVÉ ID
mongoose.connect(process.env.MONGO_URI);
bot.login(process.env.DISCORD_BOT_TOKEN);

// --- SCHÉMATA ---
const User = mongoose.model('User', new mongoose.Schema({ id: String, displayName: String, icName: String, password: {type: String, select: false}, approved: {type: Boolean, default: false} }));
const Application = mongoose.model('Application', new mongoose.Schema({
    userId: String, discordTag: String, oocName: String, age: Number, availability: String,
    fivemExp: String, prevServers: String, rpExp: String, policeExp: String, reason: String,
    rpStyle: String, area: String, specialization: [String], scenarios: String, conflicts: String,
    icName: String, icAge: Number, story: String, motivation: String, skills: String, attachments: String,
    status: { type: String, default: 'pending' }
}));

// --- MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'lssd-secret', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    if (req.isAuthenticated()) req.isAdmin = ADMIN_IDS.includes(req.user.id);
    next();
});

// --- PASSPORT STRATEGIE ---
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

// --- API CESTY ---
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/check-status'));

app.get('/check-status', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    res.redirect(req.user.approved ? '/dashboard' : '/prihlaska');
});

app.post('/submit-application', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Neautorizováno");
    await Application.create({ userId: req.user.id, discordTag: req.user.displayName, ...req.body });
    res.send("<h1>Přihláška odeslána!</h1><a href='/'>Zpět</a>");
});

app.post('/api/admin/approve/:id', async (req, res) => {
    if (!req.isAdmin) return res.status(403).send("Forbidden");
    const appData = await Application.findById(req.params.id);
    
    // Odeslání PM uživateli
    try {
        const user = await bot.users.fetch(appData.userId);
        await user.send(`Gratuluji, tvoje přihláška byla schválena! Registruj se zde: https://lssd-web.onrender.com/register`);
    } catch (e) { console.error("PM selhala:", e); }

    await User.findOneAndUpdate({ id: appData.userId }, { approved: true, icName: appData.icName });
    appData.status = 'approved';
    await appData.save();
    res.json({ success: true });
});

app.post('/register-final', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Přihlas se!");
    const hash = await bcrypt.hash(req.body.password, 10);
    await User.findOneAndUpdate({ id: req.user.id }, { icName: req.body.icName, password: hash });
    res.send("<h1>Účet vytvořen!</h1>");
});

// --- STATICKÉ STRÁNKY ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/prihlaska', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'prihlaska.html')) : res.redirect('/'));
app.get('/dashboard', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'dashboard.html')) : res.redirect('/'));
app.get('/register', (req, res) => req.isAuthenticated() ? res.sendFile(path.join(__dirname, 'register.html')) : res.redirect('/'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

app.listen(process.env.PORT || 10000);
