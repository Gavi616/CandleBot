import { EmbedBuilder } from 'discord.js';
import { getGameData } from './utils.js';
import { BOT_PREFIX } from './config.js';

export function getHelpEmbed(isAdmin, message) {
  const channelId = message.channel.id;
  const game = getGameData(channelId);
  const isGM = game && game.gmId === message.author.id;

  const baseEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Ten Candles Bot Help')
    .setDescription(
      'Start a Ten Candles session:\n' +
      `\`${BOT_PREFIX}startgame <GM ID> <Player IDs>\`: Starts a Ten Candles game.\n\n` +
      '**Gameplay:**\n' +
      `\`${BOT_PREFIX}conflict\`: Makes a conflict roll for success / failure check & determines narration rights.\n\n` +
      '**Game Management:**\n' +
      `\`${BOT_PREFIX}gamestatus\`: Shows the game\'s status.\n` +
      `\`${BOT_PREFIX}leavegame [Reason]\`: Player leaves the game.\n\n` +
      '**Direct Message Commands:**\n' +
      `\`${BOT_PREFIX}gear\`: View and Edit your character\'s inventory\n` +
      `\`${BOT_PREFIX}x\`: Signals anonymously to wrap up the scene.\n` +
      `\`${BOT_PREFIX}me\`: View your character sheet.\n`
    )
    .setTimestamp();

  if (isGM) {
    baseEmbed.addFields({
      name: '\n\n**GM Only Commands:**',
      value: `\`${BOT_PREFIX}theme [description]\`: Saves the theme description and advances character generation to Step Two.\n` +
        `\`${BOT_PREFIX}prevstep\`: Goes back one character generation step.\n` +
        `\`${BOT_PREFIX}cancelgame\`: Cancel the game.\n` +
        `\`${BOT_PREFIX}removeplayer <Player ID> [Reason]\`: Removes a player.\n` +
        `\`${BOT_PREFIX}died <Player ID> [-martyr] [Cause]\`: Marks a PC as dead. Martyr modifier allows gifting of Hope die.\n`
    });
  }

  if (isAdmin) {
    baseEmbed.addFields({
      name: '\n\n**Moderation Commands:**',
      value: `\`${BOT_PREFIX}blockuser <User ID> [Reason]\`: Block a user *from using the* \`${BOT_PREFIX}startgame\` *command only*.\n` +
        `\`${BOT_PREFIX}unblockuser <User ID>\`: Unblock a user.\n` +
        `\`${BOT_PREFIX}whitelist <Channel ID> [remove]\`: Add or remove a channel from the whitelist.\n`
    });
  }

  return { help: baseEmbed };
}