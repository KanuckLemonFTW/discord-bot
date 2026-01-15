import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } from 'discord.js';

// ================= CONFIG =================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_DM_ID = '753300433682038956'; // Admin who receives DMs
// =========================================

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildBans, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages] });

// Temporary in-memory storage for log channels
const logChannels = {
    ban: null,
    kick: null
};

// ================= SLASH COMMANDS =================
const commands = [
    new SlashCommandBuilder()
        .setName('setup-logs')
        .setDescription('Setup log channels for bans and kicks')
        .addChannelOption(option =>
            option.setName('ban_log')
                .setDescription('Channel for ban logs')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('kick_log')
                .setDescription('Channel for kick logs')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('global-ban')
        .setDescription('Ban a user from all servers the bot is in')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('User to ban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for global ban')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('global-unban')
        .setDescription('Unban a user from all servers the bot is in')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('User to unban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for global unban')
                .setRequired(true))
].map(cmd => cmd.toJSON());

// ================= REGISTER COMMANDS =================
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function registerCommands() {
    try {
        console.log('Registering commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Commands registered.');
    } catch (err) {
        console.error('Error registering commands:', err);
    }
}

// Register commands immediately when bot starts
registerCommands();

// ================= BOT EVENTS =================
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    // ---------- /setup-logs ----------
    if (interaction.commandName === 'setup-logs') {
        const banChannel = interaction.options.getChannel('ban_log');
        const kickChannel = interaction.options.getChannel('kick_log');

        logChannels.ban = banChannel.id;
        logChannels.kick = kickChannel.id;

        await interaction.reply({ content: `✅ Log channels set.\nBan logs: ${banChannel}\nKick logs: ${kickChannel}`, ephemeral: true });
        return;
    }

    // ---------- /global-ban ----------
    if (interaction.commandName === 'global-ban') {
        let successCount = 0;

        const embed = new EmbedBuilder()
            .setTitle('You have been globally banned!')
            .setDescription(`Reason: ${reason}`)
            .setColor(0xFF0000)
            .setTimestamp();

        // DM user
        try { await user.send({ embeds: [embed] }); } catch {}

        // DM admin
        try {
            const admin = await client.users.fetch(ADMIN_DM_ID);
            await admin.send({ embeds: [embed] });
        } catch {}

        // Ban in all guilds
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                await guild.members.ban(user, { reason });
                successCount++;
            } catch (e) {
                console.log(`Could not ban in ${guild.name}: ${e.message}`);
            }
        }

        await interaction.reply({ content: `Attempted to ban ${user.tag} in ${successCount} servers.`, ephemeral: true });

        // Log to configured channel
        if (logChannels.ban) {
            const logChannel = client.channels.cache.get(logChannels.ban);
            if (logChannel?.isTextBased()) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('Global Ban Executed')
                    .addFields(
                        { name: 'User', value: `${user.tag} (${user.id})` },
                        { name: 'Moderator', value: `${interaction.user.tag}` },
                        { name: 'Reason', value: reason }
                    )
                    .setColor(0xFF0000)
                    .setTimestamp();
                logChannel.send({ embeds: [logEmbed] });
            }
        }
    }

    // ---------- /global-unban ----------
    if (interaction.commandName === 'global-unban') {
        let successCount = 0;

        for (const [guildId, guild] of client.guilds.cache) {
            try {
                await guild.bans.remove(user, reason);
                successCount++;
            } catch (e) {
                console.log(`Could not unban in ${guild.name}: ${e.message}`);
            }
        }

        await interaction.reply({ content: `Attempted to unban ${user.tag} in ${successCount} servers.`, ephemeral: true });

        // Log to configured channel
        if (logChannels.ban) {
            const logChannel = client.channels.cache.get(logChannels.ban);
            if (logChannel?.isTextBased()) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('Global Unban Executed')
                    .addFields(
                        { name: 'User', value: `${user.tag} (${user.id})` },
                        { name: 'Moderator', value: `${interaction.user.tag}` },
                        { name: 'Reason', value: reason }
                    )
                    .setColor(0x00FF00)
                    .setTimestamp();
                logChannel.send({ embeds: [logEmbed] });
            }
        }
    }
});

// ================= LOGIN =================
client.login(DISCORD_TOKEN);
