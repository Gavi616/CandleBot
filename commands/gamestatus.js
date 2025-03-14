import { gameData } from '../utils.js';

export async function gameStatus(message) {
  const channelId = message.channel.id;
  if (!gameData[channelId]) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  const game = gameData[channelId];
  const gmId = game.gmId;
  const playerIds = Object.keys(game.players);

  let gmMention = `<@${gmId}>`;
  let playerMentions = playerIds.map(playerId => `<@${playerId}>`).join(', ');

  const content = game.characterGenStep < 9
    ? `**Character Generation**\nStep: ${game.characterGenStep}\nGM: ${gmMention}\nPlayers: ${playerMentions}\nUse the \`.nextstep\` command to proceed.`
    : `**Gameplay**\nScene: ${game.scene}\nGM: ${gmMention}\nPlayers: ${playerMentions}\nUse the \`.conflict\` command to take an action and move the game forward.`;

  message.channel.send({
    content: content,
    allowedMentions: {
      parse: [], // Disallow parsing of mentions (no beep / notification)
    },
  });
}
