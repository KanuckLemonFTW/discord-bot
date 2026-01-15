import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildBans] });

const commands = [
    new SlashCommandBuilder()
        .setName('global-ban')
        .setDescription('Ban a user from all servers the bot is in')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to ban')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('global-unban')
        .setDescription('Unban a user from all servers the bot is in')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to unban')
                .setRequired(true)
        )
].map(cmd => cmd.toJSON());

// Register commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
    try {
        console.log('Registering commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('Commands registered.');
    } catch (err) {
        console.error(err);
    }
})();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const user = interaction.options.getUser('user');
    if (!user) return interaction.reply({ content: 'No user specified!', ephemeral: true });

    if (interaction.commandName === 'global-ban') {
        let count = 0;
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                await guild.members.ban(user, { reason: `Global ban by ${interaction.user.tag}` });
                count++;
            } catch (e) {
                console.log(`Could not ban in ${guild.name}: ${e.message}`);
            }
        }
        await interaction.reply(`Attempted to ban ${user.tag} in ${count} servers.`);
    }

    if (interaction.commandName === 'global-unban') {
        let count = 0;
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                await guild.bans.remove(user, `Global unban by ${interaction.user.tag}`);
                count++;
            } catch (e) {
                console.log(`Could not unban in ${guild.name}: ${e.message}`);
            }
        }
        await interaction.reply(`Attempted to unban ${user.tag} in ${count} servers.`);
    }
});

client.login(process.env.DISCORD_TOKEN);
