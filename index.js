require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const queue = new Map();

client.once('ready', () => {
  console.log(`🎵 GhostTunes is online as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  const args = message.content.split(' ');
  const command = args.shift().toLowerCase();

  if (command === '!play') {
    if (!args.length) return message.reply('Please provide a YouTube link or search term!');
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('You must be in a voice channel first!');

    const serverQueue = queue.get(message.guild.id);
    const songInfo = await play.search(args.join(' '), { limit: 1 });
    if (!songInfo.length) return message.reply('No results found!');
    const song = {
      title: songInfo[0].title,
      url: songInfo[0].url
    };

    if (!serverQueue) {
      const queueContruct = {
        textChannel: message.channel,
        voiceChannel: voiceChannel,
        connection: null,
        player: null,
        songs: [],
        playing: true
      };

      queue.set(message.guild.id, queueContruct);
      queueContruct.songs.push(song);

      try {
        queueContruct.connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator
        });

        playSong(message.guild, queueContruct.songs[0]);
      } catch (err) {
        console.error(err);
        queue.delete(message.guild.id);
        return message.channel.send('Error joining voice channel!');
      }
    } else {
      serverQueue.songs.push(song);
      return message.channel.send(`✅ **${song.title}** added to queue!`);
    }
  }

  if (command === '!skip') {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue) return message.reply('Nothing to skip!');
    serverQueue.player.stop();
    message.reply('⏭️ Skipped!');
  }

  if (command === '!stop') {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue) return message.reply('Nothing is playing!');
    serverQueue.songs = [];
    serverQueue.player.stop();
    message.reply('🛑 Stopped!');
  }

  if (command === '!pause') {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue || !serverQueue.playing) return message.reply('Nothing is playing!');
    serverQueue.player.pause();
    serverQueue.playing = false;
    message.reply('⏸️ Paused!');
  }

  if (command === '!resume') {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue || serverQueue.playing) return message.reply('Nothing is paused!');
    serverQueue.player.unpause();
    serverQueue.playing = true;
    message.reply('▶️ Resumed!');
  }
});

async function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }

  const stream = await play.stream(song.url);
  const resource = createAudioResource(stream.stream, { inputType: stream.type });

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  player.play(resource);
  serverQueue.player = player;
  serverQueue.connection.subscribe(player);

  serverQueue.textChannel.send(`🎶 Now playing: **${song.title}**`);

  player.on(AudioPlayerStatus.Idle, () => {
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  });

  player.on('error', error => {
    console.error(error);
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  });
}

client.login(process.env.TOKEN);
