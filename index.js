import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';

// ================= CONFIG =================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_DM_ID = '753300433682038956';
// =========================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

// ================= IN-MEMORY STORAGE =================
const logChannels = {
  ban: null,
  kick: null
};

const permissions = {
  roles: new Set(), // role IDs
  users: new Set()  // user IDs
};
// ====================================================

// ================= SLASH COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName('setup-logs')
    .setDescription('Setup log channels')
    .addChannelOption(o =>
      o.setName('ban_log').setDescription('Ban log channel').setRequired(true))
    .addChannelOption(o =>
      o.setName('kick_log').setDescription('Kick log channel').setRequired(true)),

  new SlashCommandBuilder()
    .setName('permissions-add')
    .setDescription('Allow a role or user to use global moderation')
    .addRoleOption(o =>
      o.setName('role').setDescription('Role to allow').setRequired(false))
    .addUserOption(o =>
      o.setName('user').setDescription('User to allow').setRequired(false)),

  new SlashCommandBuilder()
    .setName('global-ban')
    .setDescription('Ban a user from all servers')
    .addUserOption(o =>
      o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o =>
      o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('global-unban')
    .setDescription('Unban a user from all servers')
    .addUserOption(o =>
      o.setName('user').setDescription('User to unban').setRequired(true))
    .addStringOption(o =>
      o.setName('reason').setDescription('Reason').setRequired(true))
].map(c => c.toJSON());

// ================= REGISTER COMMANDS =================
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

await rest.put(
  Routes.applicationCommands(CLIENT_ID),
  { body: commands }
);

console.log('Commands registered');

// ================= PERMISSION CHECK =================
function hasPermission(member) {
  if (permissions.users.has(member.id)) return true;
  return member.roles.cache.some(r => permissions.roles.has(r.id));
}

// ================= BOT EVENTS =================
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  // ---------- SETUP LOGS ----------
  if (interaction.commandName === 'setup-logs') {
    logChannels.ban = interaction.options.getChannel('ban_log').id;
    logChannels.kick = interaction.options.getChannel('kick_log').id;
    return interaction.reply({ content: '✅ Log channels set.', ephemeral: true });
  }

  // ---------- PERMISSIONS ADD ----------
  if (interaction.commandName === 'permissions-add') {
    const role = interaction.options.getRole('role');
    const user = interaction.options.getUser('user');

    if (!role && !user) {
      return interaction.reply({
        content: '❌ You must specify a role or a user.',
        ephemeral: true
      });
    }

    if (role) permissions.roles.add(role.id);
    if (user) permissions.users.add(user.id);

    return interaction.reply({
      content: `✅ Permission added:\n${role ? `Role: ${role}` : ''}\n${user ? `User: ${user.tag}` : ''}`,
      ephemeral: true
    });
  }

  // ---------- GLOBAL BAN / UNBAN ----------
  if (interaction.commandName === 'global-ban' || interaction.commandName === 'global-unban') {
    if (!hasPermission(interaction.member)) {
      return interaction.reply({
        content: '❌ You are not authorized to use this command.',
        ephemeral: true
      });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    let count = 0;

    const embed = new EmbedBuilder()
      .setColor(interaction.commandName === 'global-ban' ? 0xFF0000 : 0x00FF00)
      .setTitle(interaction.commandName === 'global-ban' ? 'Global Ban Issued' : 'Global Unban Issued')
      .addFields(
        { name: 'User', value: `${user.tag} (${user.id})` },
        { name: 'Moderator', value: interaction.user.tag },
        { name: 'Reason', value: reason }
      )
      .setTimestamp();

    // DM user + admin
    try { await user.send({ embeds: [embed] }); } catch {}
    try {
      const admin = await client.users.fetch(ADMIN_DM_ID);
      await admin.send({ embeds: [embed] });
    } catch {}

    for (const [, guild] of client.guilds.cache) {
      try {
        if (interaction.commandName === 'global-ban') {
          await guild.members.ban(user, { reason });
        } else {
          await guild.bans.remove(user, reason);
        }
        count++;
      } catch {}
    }

    // Log
    if (logChannels.ban) {
      const ch = client.channels.cache.get(logChannels.ban);
      if (ch?.isTextBased()) ch.send({ embeds: [embed] });
    }

    return interaction.reply({
      content: `✅ ${interaction.commandName === 'global-ban' ? 'Banned' : 'Unbanned'} in ${count} servers.`,
      ephemeral: true
    });
  }
});

// ================= LOGIN =================
client.login(DISCORD_TOKEN);
