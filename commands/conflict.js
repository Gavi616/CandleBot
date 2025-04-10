// commands/conflict.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { startTruthsSystem, isTesting, client } from '../index.js'; // Added client
import { saveGameData, numberToWords, getDMResponse, playRandomConflictSound, respondViaDM, markPlayerDead, areOtherPlayersAlive, sendDM, formatDuration } from '../utils.js'; // Added markPlayerDead, areOtherPlayersAlive, sendDM, formatDuration
import { SACRIFICE_TIMEOUT, BRINK_TIMEOUT, CONSENT_TIMEOUT, BOT_PREFIX, MARTYRDOM_TIMEOUT } from '../config.js'; // Added MARTYRDOM_TIMEOUT
// Removed import { died } from './died.js'; // We don't call died directly anymore

async function extinguishCandle(message, channelId) {
  const game = getGameData(channelId); // Use getGameData
  if (!game) return;

  // Don't extinguish if already in last stand
  if (game.inLastStand) return;

  game.scene++;
  const litCandles = 10 - game.scene; // 10 candles total, scene 1 = 10 lit, scene 10 = 1 lit

  if (litCandles < 1) {
    game.inLastStand = true;
    game.dicePool = 0; // No more dice
    saveGameData();
    await message.channel.send(`:candle: The last candle is extinguished. The darkness closes in.\n\n**WE ARE IN THE LAST STAND.**\n\nGM, narrate the final moments until all remaining characters meet their end. Use \`${BOT_PREFIX}died @Player [cause]\` for each character.`);
    // Check if anyone is already dead, if so, maybe trigger recordings? Unlikely path but possible.
    const allPlayersDead = Object.values(game.players).every(player => player.isDead);
     if (allPlayersDead && !game.endGame && !game.playingRecordings) {
        console.log(`extinguishCandle: All players already dead upon entering Last Stand in game ${channelId}. Starting recordings.`);
        await playRecordings(message.channel);
     }
  } else {
    game.dicePool = litCandles; // Reset dice pool for the new scene
    saveGameData();
    await startChangingScenes(message, channelId);
  }
}

async function startChangingScenes(message, channelId) {
  const game = getGameData(channelId); // Use getGameData
  if (!game || game.inLastStand) return; // Don't run if game ended or in last stand

  const litCandles = 10 - game.scene; // Recalculate based on updated scene number
  const candlesExtinguished = game.scene; // Scene number equals extinguished candles

  await message.channel.send(`**--- Scene ${game.scene} End ---**\nA candle flickers out.`);
  await sendCandleStatus(message.channel, litCandles); // Use sendCandleStatus from utils
  await message.channel.send(`**--- Scene ${game.scene + 1} Start ---**\n\n**Changing Scenes:**`);

  await startTruthsSystem(client, message, channelId); // Assuming startTruthsSystem is correctly defined/imported in index.js

  // Refresh dice pool (already done in extinguishCandle)
  // game.dicePool = litCandles; // Redundant if done in extinguishCandle
  // game.diceLost = 0; // Reset lost dice counter - This should happen in startTruthsSystem or here
  game.diceLost = 0; // Resetting here for clarity
  saveGameData();

  await message.channel.send(`GM, please introduce Scene ${game.scene + 1}.`);
}


export async function conflict(message, args, gameData) { // gameData passed here is the global object, use getGameData for specific game
  const channelId = message.channel.id;
  const playerId = message.author.id;
  // const playerNumericId = parseInt(playerId); // Not needed if using string IDs
  const game = getGameData(channelId); // Get the specific game for this channel

  if (!game) {
    message.reply(`There is no **Ten Candles** game in progress in this channel.\nUse \`${BOT_PREFIX}startgame\` to begin a session.`);
    return;
  }
  if (game.gmId === playerId) {
    try {
      await sendDM(message.author, 'The GM cannot use the `.conflict` command.');
      await message.delete();
    } catch (error) {
      if (error.code !== 10008) console.error(`conflict: Failed to delete GM message in <#${channelId}>: ${error.message}`);
    }
    return;
  }
  if (game.inLastStand) {
    message.reply("We are in **The Last Stand**. No more conflict rolls can be made.");
    return;
  }
  if (game.characterGenStep < 9) { // Check against step 9
    try {
      await sendDM(message.author, 'This command can only be used after character generation is complete.');
      await message.delete();
    } catch (error) {
      if (error.code !== 10008) console.error(`conflict: Failed to delete pre-game message in <#${channelId}>: ${error.message}`);
    }
    return;
  }
  if (!game.players || !game.players[playerId]) {
    console.log(`User "${message.author.username}" (ID: ${playerId}) tried to use \`.conflict\` but is not a player in game ${channelId}.`);
    await respondViaDM(message, `You are not currently a player in the game in <#${channelId}>.`, 'conflict');
    try { await message.delete(); } catch(e) { if (e.code !== 10008) console.error("Failed to delete non-player conflict command:", e); }
    return;
  }

  // --- Conflict Logic ---
  const player = game.players[playerId]; // Get player data
  if (player.isDead) {
      message.reply("You cannot initiate a conflict as you are dead.");
      return;
  }

  let currentDicePool = game.dicePool || 0; // Use game's current pool
  let hopeDiceCount = player.hopeDice || 0;
  const gmDiceCount = game.scene; // GM dice = number of extinguished candles (scene number)

  // Initial message
  const preRollMessage = await message.channel.send(`**Conflict: <@${playerId}>**\nCommunal Dice: ${currentDicePool}\nHope Dice: ${hopeDiceCount}\nGM Dice: ${gmDiceCount}\n\n*Rolling...*`);

  // --- Trait Burning Check ---
  let rerollOnes = false;
  let numOnesRerolled = 0;
  let traitToBurn = null;
  const topTrait = player.stackOrder.length > 0 ? player.stackOrder[0] : null; // Get top trait from stack

  if (topTrait && topTrait !== 'Brink' && !player[`${topTrait.toLowerCase()}Burned`]) {
      // Simulate a pre-roll to see if 1s *would* appear (optional, but allows prompt before actual roll)
      // For simplicity, we'll roll first, then offer the burn if 1s are present.

      // --- Roll Dice ---
      let rolls = [];
      for (let i = 0; i < currentDicePool; i++) {
          rolls.push(Math.floor(Math.random() * 6) + 1);
      }
      let hopeRolls = [];
      for (let i = 0; i < hopeDiceCount; i++) {
          hopeRolls.push(Math.floor(Math.random() * 6) + 1);
      }

      let initialOnes = rolls.filter(roll => roll === 1).length;
      console.log(`conflict: Initial roll for ${playerId}: Pool=[${rolls.join(',')}] Hope=[${hopeRolls.join(',')}] (Ones: ${initialOnes})`);

      if (initialOnes > 0) {
          await preRollMessage.edit(`**Conflict: <@${playerId}>**\nCommunal Dice: ${currentDicePool}\nHope Dice: ${hopeDiceCount}\nGM Dice: ${gmDiceCount}\n\n*Rolled ${initialOnes} one(s). Check your DMs to potentially burn your **${topTrait}**.*`).catch(console.error);

          const burnConfirmation = await requestConsent(
              message.author,
              `You rolled ${initialOnes} one(s) (${rolls.filter(r => r === 1).map(() => '⚀').join(' ')}).\nYour top available trait is **${topTrait}**. Burn it to reroll all ones?`,
              `burn_trait_yes_${playerId}_${channelId}`,
              `burn_trait_no_${playerId}_${channelId}`,
              CONSENT_TIMEOUT, // Use a standard timeout
              `Burn ${topTrait}?`
          );

          if (burnConfirmation) {
              rerollOnes = true;
              traitToBurn = topTrait; // Store which trait was burned
              player[`${topTrait.toLowerCase()}Burned`] = true;
              player.stackOrder.shift(); // Remove the burned trait from the stack
              await message.channel.send(`**<@${playerId}> burned their ${topTrait}!** Rerolling ones...`);

              // Perform the reroll
              numOnesRerolled = initialOnes;
              rolls = rolls.map(roll => (roll === 1 ? Math.floor(Math.random() * 6) + 1 : roll));
              console.log(`conflict: Rerolled ${numOnesRerolled} ones for ${playerId}. New Pool=[${rolls.join(',')}]`);
          } else {
              await message.channel.send(`<@${playerId}> chose not to burn their ${topTrait}.`);
          }
      }

      // --- Brink Check (only if all traits are burned) ---
      let brinkReroll = false;
      if (player.stackOrder.length === 1 && player.stackOrder[0] === 'Brink' && !player.brinkUsedThisRoll) { // Only Brink left
          await preRollMessage.edit(`**Conflict: <@${playerId}>**\nCommunal Dice: ${currentDicePool}\nHope Dice: ${hopeDiceCount}\nGM Dice: ${gmDiceCount}\n\n*All traits burned. Check your DMs to potentially use your **Brink**.*`).catch(console.error);

          const brinkConfirmation = await requestConsent(
              message.author,
              `Only your **Brink** remains: "${player.brink || 'Not Set'}".\nEmbrace your Brink to reroll **all** dice (communal and hope)?\n*Warning: If the roll still fails after using your Brink, you lose all Hope Dice.*`,
              `brink_yes_${playerId}_${channelId}`,
              `brink_no_${playerId}_${channelId}`,
              BRINK_TIMEOUT,
              `Embrace Brink?`
          );

          if (brinkConfirmation) {
              brinkReroll = true;
              player.brinkUsedThisRoll = true; // Mark brink as used for this roll attempt
              await message.channel.send(`**<@${playerId}> embraces their Brink!** Rerolling all dice...`);

              // Reroll ALL dice
              rolls = [];
              for (let i = 0; i < currentDicePool; i++) {
                  rolls.push(Math.floor(Math.random() * 6) + 1);
              }
              hopeRolls = [];
              for (let i = 0; i < hopeDiceCount; i++) {
                  hopeRolls.push(Math.floor(Math.random() * 6) + 1);
              }
              console.log(`conflict: Brink reroll for ${playerId}: Pool=[${rolls.join(',')}] Hope=[${hopeRolls.join(',')}]`);
          } else {
              await message.channel.send(`<@${playerId}> chose not to embrace their Brink this time.`);
          }
      }

      // --- Calculate Final Results ---
      const finalRolls = [...rolls, ...hopeRolls];
      const playerSixes = rolls.filter(r => r === 6).length + hopeRolls.filter(r => r === 6 || r === 5).length; // Hope dice succeed on 5 or 6
      const finalOnes = rolls.filter(r => r === 1).length; // Only count ones from the communal pool for removal

      // --- GM Roll ---
      let gmRolls = [];
      for (let i = 0; i < gmDiceCount; i++) {
          gmRolls.push(Math.floor(Math.random() * 6) + 1);
      }
      let gmSixes = gmRolls.filter(r => r === 6).length;

      // --- Format Dice Emojis ---
      const diceEmojis = rolls.map(roll => `⚀⚁⚂⚃⚄⚅`[roll - 1]).join(' ');
      const hopeDiceEmojis = hopeRolls.map(roll => `⚀⚁⚂⚃⚄⚅`[roll - 1]).join(' ');
      const gmDiceEmojis = gmRolls.map(roll => `⚀⚁⚂⚃⚄⚅`[roll - 1]).join(' ');

      // --- Determine Outcome & Narration ---
      const success = playerSixes > 0;
      let narrationWinner = '';
      if (success) {
          if (playerSixes > gmSixes) {
              narrationWinner = `<@${playerId}> (Player)`;
          } else {
              narrationWinner = `<@${game.gmId}> (GM)`;
          }
      } else {
          // Failure - GM narrates unless player sacrifices
          narrationWinner = `<@${game.gmId}> (GM)`;
      }

      // --- Build Result Message ---
      let resultMessage = `**Conflict Result for <@${playerId}>**\n\n`;
      resultMessage += `**Player Roll:**\n`;
      resultMessage += `  Communal (${currentDicePool}): ${diceEmojis || 'None'}\n`;
      if (hopeDiceCount > 0) {
          resultMessage += `  Hope (${hopeDiceCount}): ${hopeDiceEmojis || 'None'}\n`;
      }
      if (traitToBurn) {
          resultMessage += `  *Burned ${traitToBurn} to reroll ${numOnesRerolled} one(s).*\n`;
      }
      if (brinkReroll) {
          resultMessage += `  *Embraced Brink for a full reroll.*\n`;
      }
      resultMessage += `  Successes (Player): **${playerSixes}**\n\n`;

      resultMessage += `**GM Roll (${gmDiceCount}):** ${gmDiceEmojis || 'None'}\n`;
      resultMessage += `  Successes (GM): **${gmSixes}**\n\n`;

      resultMessage += `**Outcome:** ${success ? 'Success!' : 'Failure.'}\n`;

      // Handle Dice Loss
      if (finalOnes > 0) {
          game.diceLost += finalOnes; // Accumulate lost dice for the scene
          game.dicePool = Math.max(0, currentDicePool - finalOnes); // Update current pool
          resultMessage += `  *${numberToWords(finalOnes)} communal di${finalOnes === 1 ? 'e' : 'ce'} showing '1' ${finalOnes === 1 ? 'is' : 'are'} lost for this scene.*\n`;
      }
      resultMessage += `  Communal Dice Remaining: **${game.dicePool}**\n`;

      // Handle Hope Die Gain/Loss
      if (traitToBurn === 'Moment' && success) {
          player.hopeDice++;
          resultMessage += `  *Gained 1 Hope Die for succeeding on Moment! Total Hope: ${player.hopeDice}*\n`;
      }
      if (brinkReroll && !success && player.hopeDice > 0) {
          resultMessage += `  *Failed after using Brink! Lost ${player.hopeDice} Hope ${player.hopeDice === 1 ? 'Die' : 'Dice'}!*\n`;
          player.hopeDice = 0;
      }

      resultMessage += `\n**Narration:** ${narrationWinner}`;

      // --- Play Sound ---
      const voiceChannelId = game.voiceChannelId;
      const voiceChannel = client.channels.cache.get(voiceChannelId);
      if (game.gameMode === 'voice-plus-text' && voiceChannel && voiceChannel.type === ChannelType.GuildVoice) {
          const existingConnection = getVoiceConnection(message.guild.id);
          if (!existingConnection) {
              try {
                  console.log(`Conflict: Attempting to join voice channel ${voiceChannel.name} (${voiceChannelId}) for sound.`);
                  joinVoiceChannel({
                      channelId: voiceChannelId,
                      guildId: message.guild.id,
                      adapterCreator: message.guild.voiceAdapterCreator,
                      selfDeaf: false,
                      selfMute: false
                  });
                  await new Promise(resolve => setTimeout(resolve, 500));
              } catch (error) {
                  console.error(`Conflict: Failed to join voice channel ${voiceChannelId}:`, error);
              }
          }
          await playRandomConflictSound(voiceChannel); // Play sound after calculations
      }

      // --- Update Original Message & Send Result ---
      await preRollMessage.edit(`**Conflict: <@${playerId}>** - Resolved. See results below.`).catch(console.error);
      await message.channel.send({ content: resultMessage, allowedMentions: { users: [playerId, game.gmId] } }); // Mention relevant parties

      // --- Handle Failure Consequences ---
      if (!success) {
          // Sacrifice Offer
          const sacrificeConfirmation = await requestConsent(
              message.author,
              `Your conflict failed. You may sacrifice your character (<@${playerId}>) to seize narrative control for their final moments. Sacrifice?`,
              `sacrifice_yes_${playerId}_${channelId}`,
              `sacrifice_no_${playerId}_${channelId}`,
              SACRIFICE_TIMEOUT,
              `Sacrifice for Narration?`
          );

          if (sacrificeConfirmation) {
              await message.channel.send(`**<@${playerId}> chooses the ultimate sacrifice!** They seize control of the narrative for their final moments.`);

              const cause = await getDMResponse(
                  message.author,
                  `Please briefly describe the cause or manner of **${player.name || player.playerUsername}'s** death.`,
                  CONSENT_TIMEOUT, // Re-use timeout
                  m => m.author.id === playerId,
                  "Cause of Death"
              ) || "Sacrifice for narration"; // Default cause

              // --- Martyrdom Check within Sacrifice ---
              const canBeMartyr = player.hopeDice > 0 && areOtherPlayersAlive(game, playerId);

              if (canBeMartyr) {
                  console.log(`conflict (sacrifice): Player ${playerId} has ${player.hopeDice} hope dice and others are alive. Asking GM about martyrdom.`);

                  // Clear any previous pending martyrdom state
                  if (game.pendingMartyrdom) {
                      console.warn(`conflict (sacrifice): Clearing previous pending martyrdom state for game ${channelId}`);
                      if (game.pendingMartyrdom.gmTimeoutId) clearTimeout(game.pendingMartyrdom.gmTimeoutId);
                      if (game.pendingMartyrdom.playerTimeoutId) clearTimeout(game.pendingMartyrdom.playerTimeoutId);
                      delete game.pendingMartyrdom;
                  }

                  const gmUser = await client.users.fetch(game.gmId);
                  const martyrEmbed = new EmbedBuilder()
                      .setColor(0xFFA500)
                      .setTitle('Martyrdom Opportunity (Sacrifice)')
                      .setDescription(`**${player.name || player.playerUsername}** (<@${playerId}>) sacrificed themselves and has ${player.hopeDice} Hope ${player.hopeDice === 1 ? 'Die' : 'Dice'} remaining.\n\nWas their sacrifice a martyrdom, allowing them to pass on **one** Hope Die to another living player?`)
                      .addFields({ name: 'Cause of Death', value: cause })
                      .setFooter({ text: `Game in #${message.channel.name}. You have ${formatDuration(MARTYRDOM_TIMEOUT)} to respond.` });

                  const martyrRow = new ActionRowBuilder()
                      .addComponents(
                          new ButtonBuilder()
                              .setCustomId(`martyr_confirm_yes_${playerId}_${channelId}`)
                              .setLabel('Yes, it was Martyrdom')
                              .setStyle(ButtonStyle.Success),
                          new ButtonBuilder()
                              .setCustomId(`martyr_confirm_no_${playerId}_${channelId}`)
                              .setLabel('No, just sacrifice')
                              .setStyle(ButtonStyle.Danger)
                      );

                  try {
                      const dmMessage = await sendDM(gmUser, { embeds: [martyrEmbed], components: [martyrRow] });
                      if (!dmMessage) throw new Error("Failed to send DM to GM.");

                      await message.channel.send(`GM <@${game.gmId}>, please check your DMs to determine if this sacrifice counts as martyrdom.`);

                      // Store pending state
                      game.pendingMartyrdom = {
                          dyingPlayerId: playerId,
                          reason: cause,
                          gmMessageId: dmMessage.id,
                          gmTimeoutId: null,
                          playerTimeoutId: null
                      };

                      // Set GM timeout
                      game.pendingMartyrdom.gmTimeoutId = setTimeout(async () => {
                          const currentGame = getGameData(channelId);
                          if (currentGame && currentGame.pendingMartyrdom && currentGame.pendingMartyrdom.dyingPlayerId === playerId && currentGame.pendingMartyrdom.gmMessageId === dmMessage.id) {
                              console.log(`conflict (sacrifice): Martyrdom confirmation for ${playerId} timed out.`);
                              try {
                                  const originalDm = await gmUser.dmChannel.messages.fetch(dmMessage.id);
                                  const disabledRow = new ActionRowBuilder().addComponents(
                                      martyrRow.components.map(button => ButtonBuilder.from(button).setDisabled(true))
                                  );
                                  await originalDm.edit({ content: '*This request timed out.*', components: [disabledRow] });
                              } catch (editError) {
                                  if (editError.code !== 10008 && editError.code !== 10062) console.error("conflict (sacrifice): Error disabling buttons on GM timeout:", editError);
                              }
                              const timeoutReason = currentGame.pendingMartyrdom.reason;
                              delete currentGame.pendingMartyrdom;
                              saveGameData();
                              await message.channel.send(`Martyrdom confirmation for ${player.name || player.playerUsername} timed out. Proceeding as normal death.`);
                              markPlayerDead(currentGame, playerId, timeoutReason, message.channel);
                          }
                      }, MARTYRDOM_TIMEOUT);

                      saveGameData(); // Save pending state

                  } catch (dmError) {
                      console.error(`conflict (sacrifice): Failed to send martyrdom DM to GM ${gmUser.tag}:`, dmError);
                      await message.channel.send(`Could not DM the GM (<@${game.gmId}>) to confirm martyrdom. Proceeding as a normal death.`);
                      markPlayerDead(game, playerId, cause, message.channel); // Mark dead directly
                  }
                  // NOTE: Death is handled by the interaction or timeout now

              } else {
                  // Not eligible for martyrdom (no hope or no one else alive)
                  console.log(`conflict (sacrifice): Player ${playerId} not eligible for martyrdom. Marking dead.`);
                  markPlayerDead(game, playerId, cause, message.channel); // Mark dead directly
              }

          } else {
              // Player chose NOT to sacrifice
              await message.channel.send(`<@${playerId}> chose not to sacrifice. The GM retains narration. A candle is extinguished.`);
              await extinguishCandle(message, channelId); // Extinguish candle
          }
      } else {
          // Success - reset brinkUsedThisRoll flag for the player
          player.brinkUsedThisRoll = false;
      }

      // Save game data after all updates
      saveGameData();

  } else {
      // Handle case where topTrait is null or Brink (shouldn't happen if logic is right, but safety check)
      message.reply("Error: Could not determine your top trait. Please contact the GM.");
      console.error(`Conflict Error: Player ${playerId} in game ${channelId} has invalid stack state: ${player.stackOrder.join(', ')}`);
  }
}
