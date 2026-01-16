import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import fs from 'fs';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_DM_ID = '753300433682038956';
const ROLE_PERMISSIONS_ROLE_ID = '1459420013449580596';
const DATA_FILE = './data.json';

// ========== LOAD / SAVE DATA ==========
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      permissions: { roles: [], users: [] },
      logs: { ban: null, unban: null },
      roleRequestChannel: null
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const data = loadData();

// ========== CLIENT ==========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

// ========== COMMANDS ==========
const commands = [
  // LOGS SETUP
  new SlashCommandBuilder()
    .setName('setup-logs')
    .setDescription('Setup log channels')
    .addChannelOption(o => o.setName('ban_log').setDescription('Ban log channel').setRequired(true))
    .addChannelOption(o => o.setName('kick_log').setDescription('Kick log channel').setRequired(true)),

  // PERMISSIONS MANAGEMENT
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

  // GLOBAL BAN / UNBAN
  new SlashCommandBuilder()
    .setName('global-ban')
    .setDescription('Ban a user from all servers')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder()
    .setName('global-unban')
    .setDescription('Unban a user from all servers')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  // ROLE REQUEST SYSTEM
  new SlashCommandBuilder()
    .setName('setup-rolerequest')
    .setDescription('Set the channel for role requests')
    .addChannelOption(o => o.setName('channel').setDescription('Channel for role requests').setRequired(true)),

  new SlashCommandBuilder()
    .setName('request-role')
    .setDescription('Request roles with an approver')
    .addRoleOption(o => o.setName('roles').setDescription('Role to request').setRequired(true))
    .addUserOption(o => o.setName('approved_by').setDescription('Person who can approve').setRequired(true))
    .addStringOption(o => o.setName('notes').setDescription('Notes for the request').setRequired(false))
].map(c => c.toJSON());

// ========== REGISTER COMMANDS ==========
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
console.log('Commands registered');

// ========== HELPERS ==========
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

// ========== BOT READY ==========
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

// ========== INTERACTION HANDLER ==========
client.on('interactionCreate', async i => {
  if (!i.isCommand()) return;

  // ---------- SETUP LOGS ----------
  if (i.commandName === 'setup-logs') {
    if (!isOwner(i)) return i.reply({ content: 'Owner only.', ephemeral: true });
    data.logs.ban = i.options.getChannel('ban_log').id;
    data.logs.kick = i.options.getChannel('kick_log').id;
    saveData();
    return i.reply({ content: '✅ Log channels set.', ephemeral: true });
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
  if (['global-ban','global-unban'].includes(i.commandName)) {
    if (!hasPermission(i.member))
      return i.reply({ content: '❌ Not authorized.', ephemeral: true });

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
        if (isBan) await guild.members.ban(user, { reason });
        else await guild.bans.remove(user, reason);
        count++;
      } catch {}
    }

    log(isBan ? 'ban' : 'unban', embed);

    return i.reply({ content: `✅ ${isBan ? 'Banned' : 'Unbanned'} in ${count} servers.`, ephemeral: true });
  }

  // ---------- SETUP ROLE REQUEST ----------
  if (i.commandName === 'setup-rolerequest') {
    if (!isOwner(i)) return i.reply({ content: 'Owner only.', ephemeral: true });
    data.roleRequestChannel = i.options.getChannel('channel').id;
    saveData();
    return i.reply({ content: '✅ Role request channel set.', ephemeral: true });
  }

  // ---------- REQUEST ROLE ----------
  if (i.commandName === 'request-role') {
    const requestedRole = i.options.getRole('roles');
    const approver = i.options.getUser('approved_by');
    const notes = i.options.getString('notes') || 'No notes provided';

    const member = i.guild.members.cache.get(approver.id);
    if (!member.roles.cache.has(ROLE_PERMISSIONS_ROLE_ID))
      return i.reply({ content: '❌ Approver does not have Role Permissions Role.', ephemeral: true });

    if (member.roles.highest.position < requestedRole.position)
      return i.reply({ content: '❌ Approver cannot assign role higher than their top role.', ephemeral: true });

    if (!data.roleRequestChannel)
      return i.reply({ content: '❌ Role request channel not set.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle('Role Request')
      .setColor(0x00AAFF)
      .addFields(
        { name: 'Requester', value: i.user.tag },
        { name: 'Role Requested', value: requestedRole.name },
        { name: 'Approver', value: approver.tag },
        { name: 'Notes', value: notes }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_${i.user.id}_${requestedRole.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_${i.user.id}_${requestedRole.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

    const channel = client.channels.cache.get(data.roleRequestChannel);
    await channel.send({ embeds: [embed], components: [row] });

    return i.reply({ content: '✅ Role request submitted.', ephemeral: true });
  }
});

// ---------- BUTTON HANDLER ----------
client.on('interactionCreate', async i => {
  if (!i.isButton()) return;

  const [action, requesterId, roleId] = i.customId.split('_');
  const approverMember = i.guild.members.cache.get(i.user.id);

  // Only selected approver can click
  if (!approverMember) return;
  const requestedRole = i.guild.roles.cache.get(roleId);
  if (!requestedRole) return i.reply({ content: '❌ Role not found.', ephemeral: true });
  if (!approverMember.roles.cache.has(ROLE_PERMISSIONS_ROLE_ID))
    return i.reply({ content: '❌ You do not have permission.', ephemeral: true });
  if (approverMember.roles.highest.position < requestedRole.position)
    return i.reply({ content: '❌ Cannot assign role higher than your top role.', ephemeral: true });

  const requesterMember = await i.guild.members.fetch(requesterId);

  if (action === 'approve') {
    await requesterMember.roles.add(requestedRole);
    await requesterMember.send({ content: `✅ Your request for role ${requestedRole.name} was approved!` });
    await i.update({ content: '✅ Role approved.', components: [] });
  } else if (action === 'deny') {
    await requesterMember.send({ content: `❌ Your request for role ${requestedRole.name} was denied.` });
    await i.update({ content: '❌ Role denied.', components: [] });
  }
});

client.login(DISCORD_TOKEN);


