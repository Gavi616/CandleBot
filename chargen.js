import { getVirtualTableOrder, normalizeBrink } from './utils.js'
import {
  handleStepOne,
  handleStepTwo,
  handleStepThree,
  handleStepFour,
  handleStepFive,
  handleStepSix,
  handleStepSeven,
  handleStepEight,
  handleStepNine
} from './steps.js';

export async function sendCharacterGenStep(gameChannel, game) {
  console.log(`sendCharacterGenStep has been called with step: ${game.characterGenStep}`);
  const step = game.characterGenStep;

  switch (step) {
    case 1:
      await handleStepOne(gameChannel, game);
      break;
    case 2:
      await handleStepTwo(gameChannel, game);
      break;
    case 3:
      await handleStepThree(gameChannel, game);
      break;
    case 4:
      await handleStepFour(gameChannel, game);
      break;
    case 5:
      await handleStepFive(gameChannel, game);
      break;
    case 6:
      await handleStepSix(gameChannel, game);
      break;
    case 7:
      await handleStepSeven(gameChannel, game);
      break;
    case 8:
      await handleStepEight(gameChannel, game);
      break;
    case 9:
      await handleStepNine(gameChannel, game);
      break;
    default:
      console.warn(`Requested an unknown character generation step: ${step}`);
      break;
  }
}

export async function swapTraits(client, players, game, guildId) {
  if (typeof guildId !== 'string' || !/^\d{18}$/.test(guildId)) {
    console.error("swapTraits: Invalid guildId format. Check the guildId.");
    return players;
  }
  const playerOrder = getVirtualTableOrder(game, false);

  const swappedPlayers = {};

  for (let i = 0; i < playerOrder.length; i++) {
    const currentPlayerId = playerOrder[i];
    const nextPlayerId = playerOrder[(i + 1) % playerOrder.length];

    swappedPlayers[nextPlayerId] = {
      ...players[nextPlayerId],
      virtue: players[currentPlayerId].virtue,
      vice: players[currentPlayerId].vice,
    };
    if (!swappedPlayers[currentPlayerId]) {
      swappedPlayers[currentPlayerId] = {
        ...players[currentPlayerId],
      };
    }
  }

  const swapTraitPromises = playerOrder.map(async (recipientId, i) => {
    if (typeof recipientId !== 'string' || recipientId.length < 15) {
      console.error("swapTraits: Invalid userId format. Check the recipientId.");
    }
    const senderId = playerOrder[(i - 1 + playerOrder.length) % playerOrder.length];

    try {
      let guild;
      try {
        guild = client.guilds.cache.get(guildId);
      } catch (error) {
        console.error(`swapTraits: client.guilds.cache.get(guildId) Error:`, error);
      }
      if (!guild) {
        console.error("swapTraits: No guild found with that guildId. Check the guildId.");
        return;
      }

      let member;
      try {
        member = await guild.members.fetch(recipientId);
      } catch (error) {
        console.error(`swapTraits: guild.members.fetch(recipientId) Error:`, error);
      }

      if (!member) {
        console.error(`swapTraits: No member found with id ${recipientId} in guild ${guildId}`);
        return;
      }
      const recipientUser = member.user;

      if (!recipientUser) {
        console.error("swapTraits: No user found with that recipientId. Check the recipientId.");
        return;
      }
      const senderName = players[senderId].playerUsername;
      const recipientName = players[recipientId].playerUsername;
      await recipientUser.send(`Your Virtue (from ${senderName}): ${swappedPlayers[recipientId].virtue}\nYour Vice (from ${senderName}): ${swappedPlayers[recipientId].vice}`);
    } catch (error) {
      console.error(`Error sending trait swap DMs to player ${recipientId}:`, error);
    }
  });

  await Promise.all(swapTraitPromises);
  return swappedPlayers;
}

export function swapBrinks(players, playerOrder, gmId) {
  const swappedPlayers = { ...players };

  for (let i = 0; i < playerOrder.length; i++) {
    const currentPlayerId = playerOrder[i];
    const nextPlayerId = playerOrder[(i + 1) % playerOrder.length];
    const characterName = players[currentPlayerId]?.name || "Someone";
    swappedPlayers[nextPlayerId] = {
      ...swappedPlayers[nextPlayerId],
      brink: normalizeBrink(players[currentPlayerId]?.brink, characterName)
    };
  }

  const penultimatePlayerId = playerOrder[playerOrder.length - 1];
  const threatCharacterName = players[penultimatePlayerId]?.name || "Someone";
  const gmBrink = normalizeBrink(players[penultimatePlayerId]?.brink, threatCharacterName, true);

  return { ...swappedPlayers, [gmId]: { ...swappedPlayers[gmId], brink: gmBrink } };
}
