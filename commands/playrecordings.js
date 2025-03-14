import { gameData } from '../utils.js'; //Updated!
import {
  getVoiceConnection,
  joinVoiceChannel
} from '@discordjs/voice';
import { playAudioFromUrl, slowType } from '../utils.js';
import { ChannelType } from 'discord.js';
import { client } from '../index.js';
import { saveGameData } from '../utils.js';

export async function playRecordings(message) {
  const channelId = message.channel.id;
  const game = gameData[channelId];
  const players = game.players;

  if (!game) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  if (game.scene < 1) {
    message.reply('The game has not started yet. Use `.nextstep` to continue.');
    return;
  }

  message.channel.send('The final scene fades to black. The story is over. Your final recordings will now play.');

  message.channel.send('Playing final recordings:');

  let delay = 5000;

  const playerIds = Object.keys(players);

  async function playNextRecording(index) {
    if (index >= playerIds.length) {
      delete gameData[channelId];
      saveGameData();
      return;
    }

    const userId = playerIds[index];

    setTimeout(async () => {
      if (players[userId].recording) {
        if (game.gameMode === 'voice-plus-text') {
          // Handle voice+text mode logic
          const voiceChannelId = game.voiceChannelId;

          // Check if the bot is already in the voice channel
          const existingConnection = getVoiceConnection(message.guild.id);
          if (!existingConnection) {
            const voiceChannel = client.channels.cache.get(voiceChannelId);
            if (voiceChannel && voiceChannel.type === ChannelType.GuildVoice) {
              try {
                joinVoiceChannel({
                  channelId: voiceChannelId,
                  guildId: message.guild.id,
                  adapterCreator: message.guild.voiceAdapterCreator,
                });
                console.log(`Joined voice channel: ${voiceChannel.name}`);
              } catch (error) {
                console.error('Failed to join voice channel:', error);
                message.channel.send('Failed to join voice channel. Playing back in text only.');
                game.gameMode = "text-only";
              }
            } else {
              console.error(`Voice channel ${voiceChannelId} not found.`);
              message.channel.send('Voice channel not found. Playing back in text only.');
              game.gameMode = "text-only";
            }
          }

          if (players[userId].recording.startsWith('http')) {
            // It's an audio URL
            try {
              const voiceChannel = client.channels.cache.get(voiceChannelId);
              await playAudioFromUrl(players[userId].recording, voiceChannel);
              message.channel.send(`Recording for <@${userId}>: (Audio Played)`);
            } catch (error) {
              console.error(`Error playing audio recording for ${userId}:`, error);
              message.channel.send(`Error playing recording for <@${userId}>. Check console for details.`);
            }
          } else {
            message.channel.send(`Recording for <@${userId}>:\n*<@${userId}>'s final message...*`);
            slowType(message.channel, players[userId].recording); // Use slowType here!
          }
        } else {
          // Handle text-only mode logic
          if (players[userId].recording.startsWith('http')) {
            message.channel.send(`Recording for <@${userId}>:\n${players[userId].recording}`);
          } else {
            message.channel.send(`Recording for <@${userId}>:\n*<@${userId}>'s final message...*`);
            slowType(message.channel, players[userId].recording);
          }
        }
      } else {
        message.channel.send(`No playable recording for <@${userId}>.`);
      }

      await playNextRecording(index + 1);
    }, delay);

    delay = 3000;
  }

  await playNextRecording(0);
}
