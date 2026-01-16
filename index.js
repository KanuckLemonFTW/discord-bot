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

// ========== LOAD/ SAVE DATA ==========
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

  // ... keep your existing commands here ...
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

// ========== CLIENT EVENTS ==========
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

client.on('interactionCreate', async i => {
  if (!i.isCommand()) return;

  // ---------- SETUP ROLE REQUEST ----------
  if (i.commandName === 'setup-rolerequest') {
    if (!isOwner(i)) return i.reply({ content: 'Owner only.', ephemeral: true });
    const ch = i.options.getChannel('channel');
    data.roleRequestChannel = ch.id;
    saveData();
    return i.reply({ content: `✅ Role request channel set to ${ch}`, ephemeral: true });
  }

  // ---------- REQUEST ROLE ----------
  if (i.commandName === 'request-role') {
    const requestedRole = i.options.getRole('roles');
    const approver = i.options.getUser('approved_by');
    const notes = i.options.getString('notes') || 'No notes provided';

    // Validate approver
    const member = i.guild.members.cache.get(approver.id);
    if (!member.roles.cache.has(ROLE_PERMISSIONS_ROLE_ID)) {
      return i.reply({ content: '❌ Approver does not have the Role Permissions Role.', ephemeral: true });
    }

    // Check hierarchy
    const approverTop = member.roles.highest.position;
    if (approverTop < requestedRole.position) {
      return i.reply({ content: '❌ Approver cannot assign a role higher than their highest role.', ephemeral: true });
    }

    // Role request channel must exist
    if (!data.roleRequestChannel) {
      return i.reply({ content: '❌ Role request channel is not set. Ask the server owner to run /setup-rolerequest.', ephemeral: true });
    }

    const requestEmbed = new EmbedBuilder()
      .setTitle('Role Request')
      .setColor(0x00AAFF)
      .addFields(
        { name: 'Requester', value: `${i.user.tag}` },
        { name: 'Role Requested', value: `${requestedRole}` },
        { name: 'Approver', value: `${approver.tag}` },
        { name: 'Notes', value: notes }
      )
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
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
    await channel.send({ embeds: [requestEmbed], components: [row] });

    return i.reply({ content: '✅ Role request submitted.', ephemeral: true });
  }
});

// ---------- BUTTON INTERACTIONS ----------
client.on('interactionCreate', async i => {
  if (!i.isButton()) return;

  const [action, requesterId, roleId] = i.customId.split('_');

  if (i.user.id !== i.user.id) return; // ONLY the selected approver can click
  const approverMember = i.guild.members.cache.get(i.user.id);

  if (!approverMember.roles.cache.has(ROLE_PERMISSIONS_ROLE_ID)) {
    return i.reply({ content: '❌ You do not have permission to approve roles.', ephemeral: true });
  }

  const role = i.guild.roles.cache.get(roleId);
  if (!role) return i.reply({ content: '❌ Role not found.', ephemeral: true });

  // Check hierarchy
  if (approverMember.roles.highest.position < role.position) {
    return i.reply({ content: '❌ You cannot assign a role higher than your highest role.', ephemeral: true });
  }

  const requesterMember = await i.guild.members.fetch(requesterId);

  if (action === 'approve') {
    await requesterMember.roles.add(role);
    await requesterMember.send({ content: `✅ Your request for role ${role.name} was approved!` });
    await i.update({ content: '✅ Role approved.', components: [] });
  } else if (action === 'deny') {
    await requesterMember.send({ content: `❌ Your request for role ${role.name} was denied.` });
    await i.update({ content: '❌ Role denied.', components: [] });
  }
});

client.login(DISCORD_TOKEN);

