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

// ===== CONSTANTS =====
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_DM_ID = '753300433682038956';
const ROLE_PERMISSIONS_ROLE_ID = '1459420013449580596';
const MOD_ROLE_ID = '1459413983881723964';
const FORCEVERIFY_ROLE_ID = '1460871120365289482';
const DATA_FILE = './data.json';

// ===== LOAD / SAVE DATA =====
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      permissions: { roles: [], users: [] },
      logs: { ban: null, unban: null, kick: null, mute: null },
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
    .setDescription('Setup ban/kick log channels')
    .addChannelOption(o => o.setName('ban_log').setDescription('Ban log channel').setRequired(true))
    .addChannelOption(o => o.setName('kick_log').setDescription('Kick log channel').setRequired(true)),

  // Mute/Kick log setup
  new SlashCommandBuilder()
    .setName('setup-mute-log')
    .setDescription('Set the mute log channel')
    .addChannelOption(o => o.setName('channel').setDescription('Mute log channel').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setup-kick-log')
    .setDescription('Set the kick log channel')
    .addChannelOption(o => o.setName('channel').setDescription('Kick log channel').setRequired(true)),

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
    .addUserOption(o => o.setName('user').setDescription('Member to verify').setRequired(true)),

  // Global Mute / Kick
  new SlashCommandBuilder()
    .setName('global-mute')
    .setDescription('Mute a user in all servers')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for mute').setRequired(true)),
  new SlashCommandBuilder()
    .setName('global-kick')
    .setDescription('Kick a user from all servers')
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for kick').setRequired(true))
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
  if (i.isCommand()) {
    await i.deferReply({ ephemeral: true }).catch(()=>{});

    // ---------- Logs Setup ----------
    if (i.commandName === 'setup-logs') {
      if (!isOwner(i)) return i.editReply({ content: 'Owner only.' });
      data.logs.ban = i.options.getChannel('ban_log').id;
      data.logs.unban = i.options.getChannel('kick_log').id;
      saveData();
      return i.editReply({ content: '✅ Log channels set.' });
    }

    if (i.commandName === 'setup-mute-log') {
      if (!i.member.roles.cache.has(MOD_ROLE_ID)) return i.editReply({ content: '❌ Not authorized.' });
      data.logs.mute = i.options.getChannel('channel').id;
      saveData();
      return i.editReply({ content: '✅ Mute log channel set.' });
    }

    if (i.commandName === 'setup-kick-log') {
      if (!i.member.roles.cache.has(MOD_ROLE_ID)) return i.editReply({ content: '❌ Not authorized.' });
      data.logs.kick = i.options.getChannel('channel').id;
      saveData();
      return i.editReply({ content: '✅ Kick log channel set.' });
    }

    // ---------- Permissions ----------
    if (i.commandName.startsWith('permissions')) {
      if (!isOwner(i)) return i.editReply({ content: 'Owner only.' });
      const role = i.options.getRole('role');
      const user = i.options.getUser('user');

      if (i.commandName === 'permissions-add') {
        if (role) data.permissions.roles.push(role.id);
        if (user) data.permissions.users.push(user.id);
        saveData();
        return i.editReply({ content: '✅ Permission added.' });
      }
      if (i.commandName === 'permissions-remove') {
        if (role) data.permissions.roles = data.permissions.roles.filter(r => r!==role.id);
        if (user) data.permissions.users = data.permissions.users.filter(u => u!==user.id);
        saveData();
        return i.editReply({ content: '✅ Permission removed.' });
      }
      if (i.commandName === 'permissions-list') {
        return i.editReply({
          content: `**Roles:** ${data.permissions.roles.map(r => `<@&${r}>`).join(', ')||'None'}\n**Users:** ${data.permissions.users.map(u=>`<@${u}>`).join(', ')||'None'}`
        });
      }
    }

    // ---------- Global Ban / Unban ----------
    if (['global-ban','global-unban'].includes(i.commandName)) {
      if (!hasPermission(i.member)) return i.editReply({ content: '❌ Not authorized.' });

      const user = i.options.getUser('user');
      const reason = i.options.getString('reason');
      const isBan = i.commandName==='global-ban';

      const embed = new EmbedBuilder()
        .setTitle(isBan?'Global Ban':'Global Unban')
        .setColor(isBan?0xff0000:0x00ff00)
        .addFields(
          { name:'User', value:`${user.tag} (${user.id})`},
          { name:'Moderator', value:i.user.tag },
          { name:'Reason', value:reason }
        )
        .setTimestamp();

      try { await user.send({ embeds: [embed] }); } catch {}
      try { const admin = await client.users.fetch(ADMIN_DM_ID); await admin.send({ embeds:[embed] }); } catch {}

      let count=0;
      for(const [,guild] of client.guilds.cache){
        try{
          if(isBan) await guild.members.ban(user,{reason});
          else await guild.bans.remove(user,reason);
          count++;
        }catch{}
      }

      log(isBan?'ban':'unban',embed);
      return i.editReply({ content:`✅ ${isBan?'Banned':'Unbanned'} in ${count} servers.` });
    }

    // ---------- Role Request ----------
    if (i.commandName==='setup-rolerequest') {
      if (!isOwner(i)) return i.editReply({ content:'Owner only.' });
      data.roleRequestChannel=i.options.getChannel('channel').id;
      saveData();
      return i.editReply({ content:'✅ Role request channel set.' });
    }

    if (i.commandName==='request-role') {
      const requestedRole = i.options.getRole('roles');
      const approver = i.options.getUser('approved_by');
      const notes = i.options.getString('notes')||'No notes provided';

      const member = await i.guild.members.fetch(approver.id).catch(()=>null);
      if(!member) return i.editReply({ content:'❌ Approver not found.' });
      if(!member.roles.cache.has(ROLE_PERMISSIONS_ROLE_ID)) return i.editReply({ content:'❌ Approver does not have Role Permissions Role.' });
      if(member.roles.highest.position < requestedRole.position) return i.editReply({ content:'❌ Approver cannot assign roles higher than top role.' });

      let channel = client.channels.cache.get(data.roleRequestChannel);
      if(!channel) channel = await client.channels.fetch(data.roleRequestChannel).catch(()=>null);
      if(!channel) return i.editReply({ content:'❌ Cannot find role request channel.' });

      const embed = new EmbedBuilder()
        .setTitle('Role Request')
        .setColor(0x00AAFF)
        .addFields(
          { name:'Requester', value:i.user.tag },
          { name:'Role Requested', value:requestedRole.name },
          { name:'Approver', value:approver.tag },
          { name:'Notes', value:notes }
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_${i.user.id}_${requestedRole.id}_${approver.id}`)
          .setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`deny_${i.user.id}_${requestedRole.id}_${approver.id}`)
          .setLabel('Deny').setStyle(ButtonStyle.Danger)
      );

      await channel.send({ embeds:[embed], components:[row] });
      return i.editReply({ content:'✅ Role request submitted.' });
    }

    // ---------- Force Verify ----------
    if (i.commandName==='config-verifylog') {
      if(!isOwner(i)) return i.editReply({ content:'Owner only.' });
      data.verifyLogChannel = i.options.getChannel('channel').id;
      saveData();
      return i.editReply({ content:'✅ Verify log channel set.' });
    }

    if (i.commandName==='forceverify') {
      if(!i.member.roles.cache.has(MOD_ROLE_ID)) return i.editReply({ content:'❌ Not authorized.' });
      const targetUser = i.options.getUser('user');
      const targetMember = await i.guild.members.fetch(targetUser.id);
      const verifiedRole = i.guild.roles.cache.get(FORCEVERIFY_ROLE_ID);
      if(!verifiedRole) return i.editReply({ content:'❌ Verified role not found.' });

      await targetMember.roles.add(verifiedRole);

      const embed = new EmbedBuilder()
        .setTitle('Force Verify')
        .setColor(0x00FF00)
        .addFields(
          { name:'Member', value:`${targetUser.tag} (${targetUser.id})` },
          { name:'Executed By', value:i.user.tag },
          { name:'Role Given', value:verifiedRole.name }
        )
        .setTimestamp();

      if(data.verifyLogChannel){
        const logChannel = i.guild.channels.cache.get(data.verifyLogChannel);
        if(logChannel?.isTextBased()) logChannel.send({ embeds:[embed] });
      }

      return i.editReply({ content:`✅ ${targetUser.tag} has been force verified.` });
    }

    // ---------- Global Mute ----------
    if (i.commandName==='global-mute') {
      if(!i.member.roles.cache.has(MOD_ROLE_ID)) return i.editReply({ content:'❌ Not authorized.' });
      const user = i.options.getUser('user');
      const reason = i.options.getString('reason');

      const embed = new EmbedBuilder()
        .setTitle('Global Mute')
        .setColor(0xFFAA00)
        .addFields(
          { name:'User', value:`${user.tag} (${user.id})` },
          { name:'Moderator', value:i.user.tag },
          { name:'Reason', value:reason }
        )
        .setTimestamp();

      try { await user.send({ embeds:[embed] }); } catch {}

      let count=0;
      for(const [,guild] of client.guilds.cache){
        try{
          const member = await guild.members.fetch(user.id);
          const muteRole = guild.roles.cache.find(r=>r.name.toLowerCase()==='muted');
          if(muteRole) await member.roles.add(muteRole);
          count++;
        }catch{}
      }

      if(data.logs.mute){
        const logChannel = client.channels.cache.get(data.logs.mute);
        if(logChannel?.isTextBased()) logChannel.send({ embeds:[embed] });
      }

      return i.editReply({ content:`✅ ${user.tag} has been muted in ${count} servers.` });
    }

    // ---------- Global Kick ----------
    if (i.commandName==='global-kick') {
      if(!i.member.roles.cache.has(MOD_ROLE_ID)) return i.editReply({ content:'❌ Not authorized.' });
      const user = i.options.getUser('user');
      const reason = i.options.getString('reason');

      const embed = new EmbedBuilder()
        .setTitle('Global Kick')
        .setColor(0xFF0000)
        .addFields(
          { name:'User', value:`${user.tag} (${user.id})` },
          { name:'Moderator', value:i.user.tag },
          { name:'Reason', value:reason }
        )
        .setTimestamp();

      try { await user.send({ embeds:[embed] }); } catch {}

      let count=0;
      for(const [,guild] of client.guilds.cache){
        try{
          const member = await guild.members.fetch(user.id);
          await member.kick(reason);
          count++;
        }catch{}
      }

      if(data.logs.kick){
        const logChannel = client.channels.cache.get(data.logs.kick);
        if(logChannel?.isTextBased()) logChannel.send({ embeds:[embed] });
      }

      return i.editReply({ content:`✅ ${user.tag} has been kicked from ${count} servers.` });
    }
  }

  // ---------- Button handler for role requests ----------
  if(i.isButton()){
    const [action, requesterId, roleId, approverId] = i.customId.split('_');
    const requestedRole = i.guild.roles.cache.get(roleId);
    if(!requestedRole) return i.reply({ content:'❌ Role not found.', ephemeral:true });

    let approverMember;
    try{ approverMember = await i.guild.members.fetch(approverId); }catch{}
    if(!approverMember) return i.reply({ content:'❌ Approver not found.', ephemeral:true });

    if(i.user.id!==approverMember.id){
      await i.reply({ content:'❌ Unauthorized click. Security team has been notified.', ephemeral:true });
      const channel = i.channel;
      if(channel?.isTextBased()) channel.send({ content:`⚠️ <@${approverMember.id}>, user ${i.user.tag} tried to click your role request buttons.` });
      try{ await approverMember.send(`⚠️ User ${i.user.tag} tried to interact with a role request they are not authorized for.`); }catch{}
      return;
    }

    if(!approverMember.roles.cache.has(ROLE_PERMISSIONS_ROLE_ID))
      return i.reply({ content:'❌ You no longer have the Role Permissions Role.', ephemeral:true });
    if(approverMember.roles.highest.position < requestedRole.position)
      return i.reply({ content:'❌ Cannot assign role higher than your top role.', ephemeral:true });

    let requesterMember;
    try{ requesterMember = await i.guild.members.fetch(requesterId); }catch{}
    if(!requesterMember) return i.reply({ content:'❌ Requester not found.', ephemeral:true });

    if(action==='approve'){
      await requesterMember.roles.add(requestedRole);
      try{ await requesterMember.send({ content:`✅ Your request for role ${requestedRole.name} was approved by ${approverMember.user.tag}` }); }catch{}
      await i.update({ content:`✅ Role approved by <@${approverMember.id}>.`, components:[] });
    } else if(action==='deny'){
      try{ await requesterMember.send({ content:`❌ Your request for role ${requestedRole.name} was denied by ${approverMember.user.tag}` }); }catch{}
      await i.update({ content:`❌ Role denied by <@${approverMember.id}>.`, components:[] });
    }
  }
});

// ===== LOGIN =====
client.login(DISCORD_TOKEN);
