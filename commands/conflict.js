import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType
} from 'discord.js';
import { getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';
import { startTruthsSystem, isTesting, client } from '../index.js';
import {
  saveGameData, numberToWords, getDMResponse, playRandomConflictSound, sanitizeString,
  respondViaDM, markPlayerDead, areOtherPlayersAlive, sendDM, formatDuration,
  getGameData, sendCandleStatus, requestConsent, normalizeBrink, getOtherLivingPlayers
} from '../utils.js';
import {
  BOT_PREFIX, MARTYRDOM_TIMEOUT, CONFLICT_TIMEOUT,
  CONFLICT_EMBED_COLOR_INITIAL, CONFLICT_EMBED_COLOR_SUCCESS,
  CONFLICT_EMBED_COLOR_FAILURE, CONFLICT_EMBED_COLOR_SACRIFICE
} from '../config.js';

export async function extinguishCandle(message, channelId) {
  const game = getGameData(channelId);
  if (!game) return;
  if (game.inLastStand) return;

  console.log(`extinguishCandle: Triggered for game ${channelId}. Current scene: ${game.scene}`);

  game.scene++;
  const litCandles = Math.max(0, 11 - game.scene);
  console.log(`extinguishCandle: New scene: ${game.scene}. Lit candles: ${litCandles}`);


  if (litCandles < 1) {
    game.inLastStand = true;
    game.dicePool = 0;
    saveGameData(); // Save before sending any messages
    await message.channel.send(`The last candle is extinguished. The darkness closes in.\n\n**WE ARE IN THE LAST STAND.**\n\nGM, narrate the final moments until all remaining characters meet their end. Use \`${BOT_PREFIX}died @Player [cause]\` for each character.`);
    const allPlayersDead = Object.values(game.players).every(player => player.isDead);
    if (allPlayersDead && !game.endGame && !game.playingRecordings) {
      console.log(`extinguishCandle: All players already dead upon entering Last Stand in game ${channelId}.`);
      // await playRecordings(message.channel); // Future implementation
    }
  } else {
    game.dicePool = litCandles; // Set dice pool for the new scene
    // Don't save yet, startChangingScenes will save after truths
    await startChangingScenes(message, channelId); // This now handles the transition messages and truths
  }
}

async function startChangingScenes(message, channelId) {
  const game = getGameData(channelId);
  if (!game || game.inLastStand) return;

  const currentScene = game.scene; // Scene number already incremented
  const litCandles = 11 - game.scene;

  await message.channel.send(`*A candle flickers out.*`);
  await sendCandleStatus(message.channel, litCandles);

  // Reset diceLost for the new scene *before* truths
  game.diceLost = 0;
  saveGameData(); // Save before starting truths

  // Ensure startTruthsSystem is awaited if it's async
  await startTruthsSystem(client, message, channelId); // Assuming startTruthsSystem handles its own saves

  // Re-fetch game data in case truths modified it
  const updatedGame = getGameData(channelId);
  if (!updatedGame || updatedGame.inLastStand) return; // Check again in case game ended during truths

  // Final announcement for the GM after truths complete
  await message.channel.send(`Dice Pool: ${updatedGame.dicePool}. GM Dice: ${Math.max(0, updatedGame.scene - 1)}.`);
  await message.channel.send(`GM, please introduce Scene ${currentScene}.`);
  saveGameData();
}

export async function conflict(message, args, globalGameData) {
  const channelId = message.channel.id;
  const playerId = message.author.id;
  const game = getGameData(channelId);
  const player = game.players[playerId];

  // --- Initial Checks ---
  if (!game) return;
  if (game.gmId === playerId) {
    message.reply("The GM cannot initiate a player conflict.");
    return;
  }
  if (game.inLastStand) {
    message.reply("Conflicts cannot be initiated during The Last Stand.");
    return;
  }
  if (game.characterGenStep < 9) {
    message.reply("Character generation is not complete. Cannot initiate conflict.");
    return;
  }
  if (!game.players[playerId]) {
    message.reply("You are not a player in this game.");
    return;
  }

  if (player.isDead) {
    message.reply("You cannot initiate a conflict as you are dead.");
    return;
  }

  // Reset per-conflict Brink usage flag
  player.brinkUsedThisRoll = false;

  // --- Initial Roll & Calculation ---
  let currentDicePool = game.dicePool || 0;
  let hopeDiceCount = player.hopeDice || 0;
  const gmDiceCount = Math.max(0, game.scene - 1);

  // --- Embed Setup ---
  const embed = new EmbedBuilder()
    .setTitle(`Conflict: <@${playerId}>`)
    .setColor(CONFLICT_EMBED_COLOR_INITIAL) // Use initial color
    .setDescription(`*Rolling...*\n\nInitial Dice Pool: ${currentDicePool}\nHope Dice: ${hopeDiceCount}\nGM Dice: ${gmDiceCount}`);

  const conflictEmbedMessage = await message.channel.send({ embeds: [embed] });

  // Player Roll
  let rolls = [];
  for (let i = 0; i < currentDicePool; i++) {
    rolls.push(Math.floor(Math.random() * 6) + 1);
  }
  let hopeRolls = [];
  for (let i = 0; i < hopeDiceCount; i++) {
    hopeRolls.push(Math.floor(Math.random() * 6) + 1);
  }

  // GM Roll
  let gmRolls = [];
  for (let i = 0; i < gmDiceCount; i++) {
    gmRolls.push(Math.floor(Math.random() * 6) + 1);
  }

  // Initial Calculations
  let playerSixes = rolls.filter(r => r === 6).length + hopeRolls.filter(r => r === 6 || r === 5).length; // Used for narrative success
  let gmSixes = gmRolls.filter(r => r === 6).length; // Used for narrative success
  let finalOnes = rolls.filter(r => r === 1).length; // Based on initial players' dice pool roll
  // SUCCESS DEFINITION
  let success = rolls.some(r => r === 6) || hopeRolls.some(r => r === 5 || r === 6);
  let playerNarrativeSuccess = playerSixes > gmSixes; // GM wins ties for narration

  console.log(`conflict: Initial roll for ${playerId}: Pool=[${rolls.join(',')}] Hope=[${hopeRolls.join(',')}] (Ones: ${finalOnes}, Player Sixes: ${playerSixes}) | GM=[${gmRolls.join(',')}] (GM Sixes: ${gmSixes}) -> Success: ${success}, Narrative Success: ${playerNarrativeSuccess}`);

  // --- Reroll Options ---
  let traitToBurn = null;
  let numOnesRerolled = 0;
  let brinkReroll = false;
  let rerollHappened = false; // Flag to track if sound needs playing later
  let rerollActionText = ''; // Store reroll info for embed

  const topTrait = player.stackOrder.length > 0 ? player.stackOrder[0] : null;
  const initialOnesCount = finalOnes; // Store initial count for messages

  // --- Helper function to update embed with current rolls ---
  const updateEmbedRolls = (descriptionSuffix = '') => {
    const diceEmojis = rolls.map(roll => `⚀⚁⚂⚃⚄⚅`[roll - 1]).join(' ');
    const hopeDiceEmojis = hopeRolls.map(roll => `⚀⚁⚂⚃⚄⚅`[roll - 1]).join(' ');
    const gmDiceEmojis = gmRolls.map(roll => `⚀⚁⚂⚃⚄⚅`[roll - 1]).join(' ');

    embed.setFields( // Use setFields to replace existing fields
      { name: `Player Roll (Pool: ${currentDicePool})`, value: diceEmojis || 'None', inline: true },
      { name: `Player Roll (Hope: ${hopeDiceCount})`, value: hopeDiceEmojis || 'None', inline: true },
      { name: '\u200B', value: '\u200B' }, // Spacer
      { name: `GM Roll (Dice: ${gmDiceCount})`, value: gmDiceEmojis || 'None', inline: true },
      { name: '\u200B', value: '\u200B', inline: true }, // Spacer
      { name: '\u200B', value: '\u200B' }, // Spacer
      { name: 'Player Successes (for Narration)', value: `**${playerSixes}**`, inline: true },
      { name: 'GM Successes (for Narration)', value: `**${gmSixes}**`, inline: true }
    );
    embed.setDescription(descriptionSuffix); // Update description
  };

  // 1. Check for Ones & Offer Trait Burn
  if (initialOnesCount > 0) {
    // Show initial results before DM prompt
    updateEmbedRolls(`*Rolled ${initialOnesCount} one(s). Check your DMs for options.*`);
    await conflictEmbedMessage.edit({ embeds: [embed] }).catch(console.error);

    const burnableTraits = ['Virtue', 'Vice', 'Moment'];
    if (topTrait && burnableTraits.includes(topTrait) && !player[`${topTrait.toLowerCase()}Burned`]) {
      try {
        let burnPrompt = '';
        let traitValue = '';

        if (topTrait === 'Moment') {
          traitValue = player.moment || 'Your Moment'; // Fallback if moment text is missing
          burnPrompt = `You rolled ${initialOnesCount} one(s) (${rolls.filter(r => r === 1).map(() => '⚀').join(' ')}).\nYour top available trait is **Moment**. Did you live your **Moment** (${traitValue}) as part of this action? Burn it to reroll all ones?`;
        } else if (topTrait === 'Virtue') {
          traitValue = player.virtue || 'Your Virtue'; // Fallback
          burnPrompt = `You rolled ${initialOnesCount} one(s) (${rolls.filter(r => r === 1).map(() => '⚀').join(' ')}).\nYour top available trait is **Virtue**. Are you able to work your **Virtue** (${traitValue}) into this action? Burn it to reroll all ones?`;
        } else if (topTrait === 'Vice') {
          traitValue = player.vice || 'Your Vice'; // Fallback
          burnPrompt = `You rolled ${initialOnesCount} one(s) (${rolls.filter(r => r === 1).map(() => '⚀').join(' ')}).\nYour top available trait is **Vice**. Are you able to work your **Vice** (${traitValue}) into this action? Burn it to reroll all ones?`;
        }

        const burnConfirmation = await requestConsent(
          message.author,
          burnPrompt, // Use the constructed prompt
          `burn_trait_yes_${playerId}_${channelId}`,
          `burn_trait_no_${playerId}_${channelId}`,
          CONFLICT_TIMEOUT,
          `Burn your ${topTrait}?` // Keep title simple
        );

        if (burnConfirmation === true) {
          traitToBurn = topTrait;
          numOnesRerolled = initialOnesCount;
          player[`${traitToBurn.toLowerCase()}Burned`] = true;
          player.stackOrder.shift();

          rolls = rolls.map(roll => (roll === 1 ? Math.floor(Math.random() * 6) + 1 : roll));
          rerollHappened = true;

          playerSixes = rolls.filter(r => r === 6).length + hopeRolls.filter(r => r === 6 || r === 5).length;
          finalOnes = rolls.filter(r => r === 1).length;
          success = rolls.some(r => r === 6) || hopeRolls.some(r => r === 5 || r === 6);
          playerNarrativeSuccess = playerSixes > gmSixes;

          rerollActionText += `*Burned **${traitToBurn}** to reroll ${numOnesRerolled} one(s).*\n`;
          updateEmbedRolls(`*Rerolled ${numOnesRerolled} one(s) using ${traitToBurn}.*`); // Update description
          await conflictEmbedMessage.edit({ embeds: [embed] }).catch(console.error); // Update embed after reroll

          console.log(`conflict: Rerolled ${numOnesRerolled} ones for ${playerId} using ${traitToBurn}. New Pool=[${rolls.join(',')}] -> New Ones: ${finalOnes}, New Player Sixes: ${playerSixes}, New Success: ${success}, New Narrative Success: ${playerNarrativeSuccess}`);

        } else {
          if (burnConfirmation === null) {
            await message.author.send(`Timed out waiting for response to burn ${topTrait}. Proceeding without reroll.`).catch(console.error);
            updateEmbedRolls(`*Timed out waiting for ${topTrait} burn response.*`);
            await conflictEmbedMessage.edit({ embeds: [embed] }).catch(console.error);
          } else {
            updateEmbedRolls(`*Declined to burn ${topTrait}.*`);
            await conflictEmbedMessage.edit({ embeds: [embed] }).catch(console.error);
          }
        }
      } catch (error) {
        console.error(`Error during trait burn consent for ${playerId}:`, error);
      }
    }
  }

  // 2. Offer Brink (Only if Brink is top and not used this roll)
  // Ensure topTrait is re-evaluated in case the stack changed
  const currentTopTraitAfterBurn = player.stackOrder.length > 0 ? player.stackOrder[0] : null;
  if (currentTopTraitAfterBurn === 'Brink' && !player.brinkUsedThisRoll) {
    // Update description to indicate Brink check
    let brinkCheckDescription = embed.description + `\n*Check DMs to potentially use your Brink.*`;
    updateEmbedRolls(brinkCheckDescription);
    await conflictEmbedMessage.edit({ embeds: [embed] }).catch(console.error);

    try {
      const brinkConfirmation = await requestConsent(
        message.author,
        `Your top trait is **Brink**. Embrace it (${player.brink}) for a full reroll of the remaining dice pool? (This can only be done once per conflict).`,
        `use_brink_yes_${playerId}_${channelId}`,
        `use_brink_no_${playerId}_${channelId}`,
        CONFLICT_TIMEOUT,
        `Embrace your Brink?`
      );

      if (brinkConfirmation === true) {
        brinkReroll = true;
        player.brinkUsedThisRoll = true;

        rolls = [];
        for (let i = 0; i < currentDicePool; i++) {
          rolls.push(Math.floor(Math.random() * 6) + 1);
        }
        rerollHappened = true;

        playerSixes = rolls.filter(r => r === 6).length + hopeRolls.filter(r => r === 6 || r === 5).length;
        finalOnes = rolls.filter(r => r === 1).length;
        success = rolls.some(r => r === 6) || hopeRolls.some(r => r === 5 || r === 6);
        playerNarrativeSuccess = playerSixes > gmSixes;

        rerollActionText += `*Embraced **Brink** for a full reroll.*\n`;
        updateEmbedRolls(`*Embraced Brink for a full reroll.*`); // Update description
        await conflictEmbedMessage.edit({ embeds: [embed] }).catch(console.error); // Update embed after reroll

        console.log(`conflict: Rerolled entire pool for ${playerId} using Brink. New Pool=[${rolls.join(',')}] -> New Ones: ${finalOnes}, New Player Sixes: ${playerSixes}, New Success: ${success}, New Narrative Success: ${playerNarrativeSuccess}`);

      } else {
        if (brinkConfirmation === null) {
          await message.author.send(`Timed out waiting for response to use Brink. Proceeding without reroll.`).catch(console.error);
          updateEmbedRolls(embed.description + `\n*Timed out waiting for Brink response.*`);
          await conflictEmbedMessage.edit({ embeds: [embed] }).catch(console.error);
        } else {
          updateEmbedRolls(embed.description + `\n*Declined to use Brink.*`);
          await conflictEmbedMessage.edit({ embeds: [embed] }).catch(console.error);
        }
      }
    } catch (error) {
      console.error(`Error during Brink consent for ${playerId}:`, error);
    }
  } // End of Brink offer

  // --- Final Outcome & Embed Update ---
  let outcomeText = '';
  let hopeText = '';
  let narrationText = playerNarrativeSuccess ? '**You** have narration control.' : '**GM** has narration control.';

  // --- Handle Dice Loss (Based on FINAL ones count) ---
  let diceLostThisRoll = 0;
  if (finalOnes > 0) {
    diceLostThisRoll = finalOnes;
    game.diceLost += diceLostThisRoll;
    game.dicePool = Math.max(0, game.dicePool - diceLostThisRoll);
    outcomeText += `Lost ${diceLostThisRoll} dice from the pool due to ones.\n`;
  }

  // --- Handle Success/Failure & Hope ---
  if (success) {
    embed.setColor(CONFLICT_EMBED_COLOR_SUCCESS); // Set success color
    outcomeText += '**Outcome: Success!**\n';
    if (traitToBurn === 'Moment') { // Hope gain only on Moment burn success
      player.hopeDice = Math.min(9, player.hopeDice + 1);
      hopeText = `*Burned Moment for success! Gained 1 Hope die (Total: ${player.hopeDice})*`;
    }
  } else { // Failure
    embed.setColor(CONFLICT_EMBED_COLOR_FAILURE); // Set failure color
    outcomeText += '**Outcome: Failure.**\n';
    // HOPE DICE LOSS LOGIC (Only on Brink Failure)
    if (brinkReroll) { // Check if failure happened AFTER a Brink reroll
      if (player.hopeDice > 0) {
        hopeText = `*Failed after embracing Brink! Lost ${player.hopeDice} Hope ${player.hopeDice === 1 ? 'Die' : 'Dice'}.*`;
        player.hopeDice = 0; // Lose ALL hope dice
      } else {
        hopeText = `*Failed despite embracing Brink.*`;
      }
    }
  }

  // Update embed with final results
  updateEmbedRolls(null); // Clear description
  embed.addFields(
    { name: 'Result', value: outcomeText, inline: false },
    { name: 'Narration', value: narrationText, inline: true },
    { name: 'Dice Pool Remaining', value: `${game.dicePool}`, inline: true }
  );
  if (rerollActionText) {
    embed.addFields({ name: 'Actions Taken', value: rerollActionText.trim(), inline: false });
  }
  if (hopeText) {
    embed.addFields({ name: 'Hope Dice', value: hopeText, inline: false });
  }

  await conflictEmbedMessage.edit({ embeds: [embed], components: [] }).catch(console.error);

  // --- Play Sound ---
  const voiceChannelId = game.voiceChannelId;
  const voiceChannel = client.channels.cache.get(voiceChannelId);
  if (game.gameMode === 'voice-plus-text' && voiceChannel && voiceChannel.type === ChannelType.GuildVoice) {
    try {
      let connection = getVoiceConnection(message.guild.id);
      if (!connection || connection.joinConfig.channelId !== voiceChannelId) {
        connection = joinVoiceChannel({
          channelId: voiceChannelId, guildId: message.guild.id, adapterCreator: message.guild.voiceAdapterCreator, selfDeaf: false, selfMute: false
        });
        await new Promise(resolve => setTimeout(resolve, 750));
      }
      if (connection && connection.state.status === 'ready') {
        await playRandomConflictSound(voiceChannel);
      } else {
        console.warn(`Conflict: Voice connection not ready or failed. Status: ${connection?.state?.status}. Sound not played.`);
      }
    } catch (error) {
      console.error(`Conflict: Error joining/playing sound in voice channel ${voiceChannelId}:`, error);
    }
  }

  // --- Handle Failure Consequences ---
  if (!success) {
    // --- Offer Sacrifice/Martyrdom FIRST ---
    const otherPlayersAlive = areOtherPlayersAlive(game, playerId);
    let sacrificeOfferedOrHappened = false;

    if (otherPlayersAlive) {
      sacrificeOfferedOrHappened = true;
      // Offer Sacrifice
      try {
        const characterName = player.name || player.playerUsername; // Get character name

        // Update embed to show sacrifice offer
        embed.setColor(CONFLICT_EMBED_COLOR_SACRIFICE);
        embed.addFields({ name: 'Sacrifice Offered', value: `<@${playerId}>, your conflict failed. Check DMs to potentially sacrifice yourself for narrative control.` });
        await conflictEmbedMessage.edit({ embeds: [embed] }).catch(console.error);

        const sacrificeConfirm = await requestConsent(
          message.author,
          // Use character name in the prompt
          `Your conflict failed. You may sacrifice your character (${characterName}) to seize narrative control for their final moments. Sacrifice?`,
          `sacrifice_yes_${playerId}_${channelId}`,
          `sacrifice_no_${playerId}_${channelId}`,
          MARTYRDOM_TIMEOUT,
          `Sacrifice?`,
          // Pass reversed styles: Yes (sacrifice) is Danger, No is Success
          { yesStyle: ButtonStyle.Danger, noStyle: ButtonStyle.Success }
        );

        if (sacrificeConfirm === true) {
          // Martyrdom Check and Hope Gifting logic is now handled by interaction handlers in index.js triggered by the 'sacrifice_yes' button click and subsequent modal/GM interactions.
          console.log(`Conflict: Player ${playerId} chose sacrifice. Interaction handler will proceed.`);
          // Embed already updated to show offer, interaction handler will manage further updates/death messages.
          return; // Exit conflict function early, interaction handler takes over.
        } else { // Player declined sacrifice or timed out
          // Revert embed color if sacrifice declined/timed out
          embed.setColor(CONFLICT_EMBED_COLOR_FAILURE); // Back to failure color
          // Remove or update the sacrifice field
          const sacrificeFieldIndex = embed.data.fields?.findIndex(f => f.name === 'Sacrifice Offered');
          if (sacrificeFieldIndex !== -1 && sacrificeFieldIndex !== undefined) {
            embed.spliceFields(sacrificeFieldIndex, 1); // Remove the field
          }
          embed.addFields({ name: 'Scene Change', value: 'Sacrifice declined or timed out. A candle is extinguished.' });
          await conflictEmbedMessage.edit({ embeds: [embed] }).catch(console.error);

          if (sacrificeConfirm === null) { // TIMEOUT
            console.log(`Conflict: Player ${playerId} timed out on sacrifice. Triggering scene change.`);
            // requestConsent already sent DM. Trigger scene change.
            await extinguishCandle(message, channelId); // Pass original message for context
            return; // Exit conflict function
          } else { // sacrificeConfirm === false (Explicit No)
            console.log(`Conflict: Player ${playerId} declined sacrifice. Triggering scene change.`);
            await extinguishCandle(message, channelId); // Trigger scene change
            return; // Exit conflict function
          }
        }
      } catch (error) {
        // Error during consent - treat like timeout/no?
        console.error(`Error during sacrifice consent request for ${playerId}:`, error);
        console.log(`Conflict: Error during sacrifice consent for ${playerId}. Triggering scene change.`);
        // Update embed on error
        embed.setColor(CONFLICT_EMBED_COLOR_FAILURE);
        const sacrificeFieldIndex = embed.data.fields?.findIndex(f => f.name === 'Sacrifice Offered');
        if (sacrificeFieldIndex !== -1 && sacrificeFieldIndex !== undefined) {
            embed.spliceFields(sacrificeFieldIndex, 1);
        }
        embed.addFields({ name: 'Error', value: 'An error occurred during the sacrifice offer. A candle is extinguished.' });
        await conflictEmbedMessage.edit({ embeds: [embed] }).catch(console.error);

        await extinguishCandle(message, channelId); // Trigger scene change on error too? Seems safest.
        return; // Exit
      }
    } else { // Last player alive fails
      sacrificeOfferedOrHappened = true;
      // Update embed for last player death
      embed.setColor(CONFLICT_EMBED_COLOR_FAILURE);
      embed.addFields({ name: 'Final Failure', value: `:skull_crossbones: <@${playerId}>, you are the last one standing, and your conflict failed. You meet your end.` });
      await conflictEmbedMessage.edit({ embeds: [embed] }).catch(console.error);

      markPlayerDead(game, playerId, "Last player standing, failed conflict"); // Saves internally
      console.log(`Conflict failure for last player ${playerId}. Triggering scene change.`);
      await extinguishCandle(message, channelId); // Call for last player case
      return; // Exit
    }
  } // End of if (!success)

  // Final Save (only reached on SUCCESS)
  saveGameData();
}
