import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';
import fs from 'fs';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_DM_ID = '753300433682038956';
const DATA_FILE = './data.json';

// ================= LOAD / SAVE =================
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      permissions: { roles: [], users: [] },
      logs: { ban: null, unban: null }
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const data = loadData();
// ==============================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

// ================= COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName('setup-logs')
    .setDescription('Configure log channels')
    .addStringOption(o =>
      o.setName('type')
        .setDescription('Log type')
        .setRequired(true)
        .addChoices(
          { name: 'Global Bans', value: 'ban' },
          { name: 'Global Unbans', value: 'unban' }
        ))
    .addChannelOption(o =>
      o.setName('channel').setDescription('Log channel').setRequired(true)),

  new SlashCommandBuilder()
    .setName('permissions-add')
    .setDescription('Allow a role or user')
    .addRoleOption(o => o.setName('role').setDescription('Role to allow'))
    .addUserOption(o => o.setName('user').setDescription('User to allow')),

  new SlashCommandBuilder()
    .setName('permissions-remove')
    .setDescription('Remove a role or user')
    .addRoleOption(o => o.setName('role').setDescription('Role to remove'))
    .addUserOption(o => o.setName('user').setDescription('User to remove')),

  new SlashCommandBuilder()
    .setName('permissions-list')
    .setDescription('List allowed roles and users'),

  new SlashCommandBuilder()
    .setName('global-ban')
    .setDescription('Ban a user from all servers')
    .addUserOption(o =>
      o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o =>
      o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('global-unban')
    .setDescription('Unban a user from all servers')
    .addUserOption(o =>
      o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o =>
      o.setName('reason').setDescription('Reason').setRequired(true))
].map(c => c.toJSON());

// ================= REGISTER =================
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

// ================= HELPERS =================
const isOwner = i => i.guild.ownerId === i.user.id;

const hasPermission = member =>
  data.permissions.users.includes(member.id) ||
  member.roles.cache.some(r => data.permissions.roles.includes(r.id));

function log(type, embed) {
  const channelId = data.logs[type];
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (channel?.isTextBased()) channel.send({ embeds: [embed] });
}
// ==========================================

client.once('ready', () =>
  console.log(`Logged in as ${client.user.tag}`)
);

client.on('interactionCreate', async i => {
  if (!i.isCommand()) return;

  // ---------- LOG SETUP ----------
  if (i.commandName === 'setup-logs') {
    if (!isOwner(i)) return i.reply({ content: 'Owner only.', ephemeral: true });

    data.logs[i.options.getString('type')] =
      i.options.getChannel('channel').id;

    saveData();
    return i.reply({ content: '✅ Log channel set.', ephemeral: true });
  }

  // ---------- PERMISSIONS ----------
  if (i.commandName.startsWith('permissions')) {
    if (!isOwner(i)) return i.reply({ content: 'Owner only.', ephemeral: true });

    const role = i.options.getRole('role');
    const user = i.options.getUser('user');

    if (i.commandName === 'permissions-add') {
      if (role) data.permissions.roles.push(role.id);
      if (user) data.permissions.users.push(user.id);
      saveData();
      return i.reply({ content: '✅ Permission added.', ephemeral: true });
    }

    if (i.commandName === 'permissions-remove') {
      if (role) data.permissions.roles = data.permissions.roles.filter(r => r !== role.id);
      if (user) data.permissions.users = data.permissions.users.filter(u => u !== user.id);
      saveData();
      return i.reply({ content: '✅ Permission removed.', ephemeral: true });
    }

    if (i.commandName === 'permissions-list') {
      return i.reply({
        content:
          `**Roles:** ${data.permissions.roles.map(r => `<@&${r}>`).join(', ') || 'None'}\n` +
          `**Users:** ${data.permissions.users.map(u => `<@${u}>`).join(', ') || 'None'}`,
        ephemeral: true
      });
    }
  }

  // ---------- GLOBAL BAN / UNBAN ----------
  if (!hasPermission(i.member))
    return i.reply({ content: 'Not authorized.', ephemeral: true });

  const user = i.options.getUser('user');
  const reason = i.options.getString('reason');
  const isBan = i.commandName === 'global-ban';

  const embed = new EmbedBuilder()
    .setColor(isBan ? 0xff0000 : 0x00ff00)
    .setTitle(isBan ? 'Global Ban' : 'Global Unban')
    .addFields(
      { name: 'User', value: `${user.tag} (${user.id})` },
      { name: 'Moderator', value: i.user.tag },
      { name: 'Reason', value: reason }
    )
    .setTimestamp();

  try { await user.send({ embeds: [embed] }); } catch {}
  try {
    const admin = await client.users.fetch(ADMIN_DM_ID);
    await admin.send({ embeds: [embed] });
  } catch {}

  let count = 0;
  for (const [, guild] of client.guilds.cache) {
    try {
      isBan
        ? await guild.members.ban(user, { reason })
        : await guild.bans.remove(user, reason);
      count++;
    } catch {}
  }

  log(isBan ? 'ban' : 'unban', embed);

  return i.reply({
    content: `✅ ${isBan ? 'Banned' : 'Unbanned'} in ${count} servers.`,
    ephemeral: true
  });
});

client.login(DISCORD_TOKEN);
