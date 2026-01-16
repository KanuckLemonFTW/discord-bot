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
const FORCEVERIFY_ROLE_ID = '1460871120365289482';
const FORCEVERIFY_EXEC_ROLE_ID = '1459413983881723964';

// ===== LOAD / SAVE DATA =====
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      permissions: { roles: [], users: [] },
      logs: { ban: null, unban: null },
      roleRequestChannel: null,
      verifyLogChannel: null
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const data = loadData();

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

// ===== COMMANDS =====
const commands = [
  // Logs setup
  new SlashCommandBuilder()
    .setName('setup-logs')
    .setDescription('Setup log channels')
    .addChannelOption(o => o.setName('ban_log').setDescription('Ban log channel').setRequired(true))
    .addChannelOption(o => o.setName('kick_log').setDescription('Kick log channel').setRequired(true)),

  // Permissions
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

  // Global Ban/Unban
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

  // Role Requests
  new SlashCommandBuilder()
    .setName('setup-rolerequest')
    .setDescription('Set the channel for role requests')
    .addChannelOption(o => o.setName('channel').setDescription('Channel for role requests').setRequired(true)),
  new SlashCommandBuilder()
    .setName('request-role')
    .setDescription('Request roles with an approver')
    .addRoleOption(o => o.setName('roles').setDescription('Role to request').setRequired(true))
    .addUserOption(o => o.setName('approved_by').setDescription('Person who can approve').setRequired(true))
    .addStringOption(o => o.setName('notes').setDescription('Notes for the request').setRequired(false)),

  // Force Verify
  new SlashCommandBuilder()
    .setName('config-verifylog')
    .setDescription('Set the verify log channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel for verify logs').setRequired(true)),
  new SlashCommandBuilder()
    .setName('forceverify')
    .setDescription('Force verify a member by giving them the verified role')
    .addUserOption(o => o.setName('user').setDescription('Member to verify').setRequired(true))
].map(c => c.toJSON());

// ===== REGISTER COMMANDS =====
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
console.log('Commands registered');

// ===== HELPERS =====
const isOwner = i => i.guild.ownerId === i.user.id;
const hasPermission = member => data.permissions.users.includes(member.id) || member.roles.cache.some(r => data.permissions.roles.includes(r.id));

function log(type, embed) {
  const channelId = data.logs[type];
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (channel?.isTextBased()) channel.send({ embeds: [embed] });
}

// ===== READY =====
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

// ===== INTERACTION HANDLER =====
client.on('interactionCreate', async i => {
  if (!i.isCommand()) return;

  // --- Setup Logs ---
  if (i.commandName === 'setup-logs') {
    if (!isOwner(i)) return i.reply({ content: 'Owner only.', ephemeral: true });
    await i.deferReply({ ephemeral: true });
    data.logs.ban = i.options.getChannel('ban_log').id;
    data.logs.kick = i.options.getChannel('kick_log').id;
    saveData();
    return i.editReply({ content: '✅ Log channels set.' });
  }

  // --- Permissions ---
  if (i.commandName.startsWith('permissions')) {
    if (!isOwner(i)) return i.reply({ content: 'Owner only.', ephemeral: true });
    await i.deferReply({ ephemeral: true });
    const role = i.options.getRole('role');
    const user = i.options.getUser('user');

    if (i.commandName === 'permissions-add') {
      if (role) data.permissions.roles.push(role.id);
      if (user) data.permissions.users.push(user.id);
      saveData();
      return i.editReply({ content: '✅ Permission added.' });
    }

    if (i.commandName === 'permissions-remove') {
      if (role) data.permissions.roles = data.permissions.roles.filter(r => r !== role.id);
      if (user) data.permissions.users = data.permissions.users.filter(u => u !== user.id);
      saveData();
      return i.editReply({ content: '✅ Permission removed.' });
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

  // --- Global Ban / Unban ---
  if (['global-ban','global-unban'].includes(i.commandName)) {
    if (!hasPermission(i.member)) return i.reply({ content: '❌ Not authorized.', ephemeral: true });
    await i.deferReply({ ephemeral: true });

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
    try { const admin = await client.users.fetch(ADMIN_DM_ID); await admin.send({ embeds: [embed] }); } catch {}

    let count = 0;
    for (const [, guild] of client.guilds.cache) {
      try {
        if (isBan) await guild.members.ban(user, { reason });
        else await guild.bans.remove(user, reason);
        count++;
      } catch {}
    }

    log(isBan ? 'ban' : 'unban', embed);
    return i.editReply({ content: `✅ ${isBan ? 'Banned' : 'Unbanned'} in ${count} servers.` });
  }

  // --- Setup Role Request ---
  if (i.commandName === 'setup-rolerequest') {
    if (!isOwner(i)) return i.reply({ content: 'Owner only.', ephemeral: true });
    await i.deferReply({ ephemeral: true });
    data.roleRequestChannel = i.options.getChannel('channel').id;
    saveData();
    return i.editReply({ content: '✅ Role request channel set.' });
  }

  // --- Request Role ---
  if (i.commandName === 'request-role') {
    await i.deferReply({ ephemeral: true });

    const requestedRole = i.options.getRole('roles');
    const approver = i.options.getUser('approved_by');
    const notes = i.options.getString('notes') || 'No notes provided';

    const member = i.guild.members.cache.get(approver.id);
    if (!member) return i.editReply({ content: '❌ Approver not found in this server.', ephemeral: true });

    if (!member.roles.cache.has(ROLE_PERMISSIONS_ROLE_ID))
      return i.editReply({ content: '❌ Approver does not have the required Role Permissions Role.', ephemeral: true });

    if (member.roles.highest.position < requestedRole.position)
      return i.editReply({ content: '❌ Approver cannot assign roles higher than their top role.', ephemeral: true });

    let channel = client.channels.cache.get(data.roleRequestChannel);
    if (!channel) {
      try { channel = await client.channels.fetch(data.roleRequestChannel); }
      catch { return i.editReply({ content: '❌ Cannot find role request channel.', ephemeral: true }); }
    }

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
        .setCustomId(`approve_${i.user.id}_${requestedRole.id}_${approver.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_${i.user.id}_${requestedRole.id}_${approver.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [row] });
    await i.editReply({ content: '✅ Role request submitted.' });
  }

  // --- Config Verify Log ---
  if (i.commandName === 'config-verifylog') {
    if (!isOwner(i)) return i.reply({ content: 'Owner only.', ephemeral: true });
    await i.deferReply({ ephemeral: true });
    data.verifyLogChannel = i.options.getChannel('channel').id;
    saveData();
    return i.editReply({ content: '✅ Verify log channel set.' });
  }

  // --- Force Verify ---
  if (i.commandName === 'forceverify') {
    await i.deferReply({ ephemeral: true });
    const executor = i.member;
    if (!executor.roles.cache.has(FORCEVERIFY_EXEC_ROLE_ID))
      return i.editReply({ content: '❌ You do not have permission to run this command.' });

    const targetUser = i.options.getUser('user');
    const targetMember = await i.guild.members.fetch(targetUser.id);
    const verifiedRole = i.guild.roles.cache.get(FORCEVERIFY_ROLE_ID);
    if (!verifiedRole) return i.editReply({ content: '❌ Verified role not found.' });

    await targetMember.roles.add(verifiedRole);

    const embed = new EmbedBuilder()
      .setTitle('Force Verify')
      .setColor(0x00FF00)
      .addFields(
        { name: 'Member', value: `${targetUser.tag} (${targetUser.id})` },
        { name: 'Executed By', value: executor.user.tag },
        { name: 'Role Given', value: verifiedRole.name }
      )
      .setTimestamp();

    if (data.verifyLogChannel) {
      const logChannel = i.guild.channels.cache.get(data.verifyLogChannel);
      if (logChannel?.isTextBased()) logChannel.send({ embeds: [embed] });
    }

    return i.editReply({ content: `✅ ${targetUser.tag} has been force verified.` });
  }
});

// ===== BUTTON HANDLER (SECURE ROLE REQUEST) =====
client.on('interactionCreate', async i => {
  if (!i.isButton()) return;

  const [action, requesterId, roleId, approverId] = i.customId.split('_');
  const requestedRole = i.guild.roles.cache.get(roleId);
  if (!requestedRole) return i.reply({ content: '❌ Role not found.', ephemeral: true });

  let approverMember;
  try { approverMember = await i.guild.members.fetch(approverId); } catch {}
  if (!approverMember) return i.reply({ content: '❌ Approver not found.', ephemeral: true });

  if (i.user.id !== approverMember.id) {
    await i.reply({ content: '❌ Unauthorized click. Security team has been notified.', ephemeral: true });
    const channel = i.channel;
    if (channel?.isTextBased()) channel.send({ content: `⚠️ <@${approverMember.id}>, user ${i.user.tag} tried to click your role request buttons.` });
    try { await approverMember.send(`⚠️ User ${i.user.tag} tried to interact with a role request they are not authorized for.`); } catch {}
    return;
  }

  if (!approverMember.roles.cache.has(ROLE_PERMISSIONS_ROLE_ID))
    return i.reply({ content: '❌ You no longer have the Role Permissions Role.', ephemeral: true });

  if (approverMember.roles.highest.position < requestedRole.position)
    return i.reply({ content: '❌ Cannot assign role higher than your top role.', ephemeral: true });

  let requesterMember;
  try { requesterMember = await i.guild.members.fetch(requesterId); } catch {}
  if (!requesterMember) return i.reply({ content: '❌ Requester not found.', ephemeral: true });

  if (action === 'approve') {
    await requesterMember.roles.add(requestedRole);
    try { await requesterMember.send({ content: `✅ Your request for role ${requestedRole.name} was approved by ${approverMember.user.tag}!` }); } catch {}
    await i.update({ content: `✅ Role approved by <@${approverMember.id}>.`, components: [] });
  } else if (action === 'deny') {
    try { await requesterMember.send({ content: `❌ Your request for role ${requestedRole.name} was denied by ${approverMember.user.tag}.` }); } catch {}
    await i.update({ content: `❌ Role denied by <@${approverMember.id}>.`, components: [] });
  }
});

client.login(DISCORD_TOKEN);
