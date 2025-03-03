const Discord = require("discord.js");

module.exports.help = new Discord.MessageEmbed()
	.setColor("#0099ff")
	.setTitle("Help")
	.setDescription(
		`Hi, I'm CandleBot. Use the following syntax to interact with me:`
	)
	.addFields(
		{
			name: `You say...`,
			inline: true,
			value: `\` .start \`
			\` .nextstep \`
			\` .action \`
			\` .save \`
			\` .load \`
			\` .end \``,
		},
		{
			name: `To...`,
			inline: true,
			value: `Begin a new 10 Candles game.
			Move to the next step of character creation.
			Take actions and roll dice.
    		Save a 10 Candles game in-progress.
			Load a saved 10 Candles game.
    		End a 10 Candles game and delete all data.`,
		},
		{
			name: `Show this message again:`,
			value: `\` !help \` `,
		}
	);