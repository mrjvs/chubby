import { SlowMode, SlowModeStage } from '@/models/slow-mode';
import handleSlowMode from '@/slow-mode';
import { SlashCommandBuilder } from '@discordjs/builders';
import { sendEventLogMessage } from '@/util';
import { ChannelType, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';

async function slowModeHandler(interaction: ChatInputCommandInteraction): Promise<void> {
	switch (interaction.options.getSubcommandGroup()) {
		case 'stage': {
			switch (interaction.options.getSubcommand()) {
				case 'set':
					return setStageHandler(interaction);
				case 'unset':
					return unsetStageHandler(interaction);
			}
			break;
		}
		case 'enable': {
			switch (interaction.options.getSubcommand()) {
				case 'auto':
					return enableAutoSlowModeHandler(interaction);
				case 'static':
					return enableStaticSlowModeHandler(interaction);
			}
			break;
		}
		case null: {
			switch (interaction.options.getSubcommand()) {
				case 'disable':
					return disableSlowModeHandler(interaction);
				case 'stats':
					return slowModeStatsHandler(interaction);
			}
		}
	}

	throw new Error('Unknown slow mode command');
}

async function setStageHandler(interaction: ChatInputCommandInteraction): Promise<void> {
	await interaction.deferReply({ ephemeral: true });

	const channel = interaction.options.getChannel('channel') ?? interaction.channel;
	if (!channel) {
		throw new Error('No channel given');
	}

	if (channel.type !== ChannelType.GuildText) {
		throw new Error('Slow mode only applies to text channels');
	}

	const slowMode = await SlowMode.findOne({
		where: {
			channel_id: channel.id
		},
		include: 'stages'
	});

	if (!slowMode) {
		throw new Error(`No slow mode set for <#${channel.id}>`);
	}

	const threshold = interaction.options.getInteger('threshold', true);
	const limit = interaction.options.getInteger('limit', true);

	let oldLimit: number | null = null;
	let stage = slowMode.stages?.find(stage => stage.threshold === threshold);
	if (stage) {
		oldLimit = stage.limit;
		stage.limit = interaction.options.getInteger('limit', true);
		await stage.save();
	} else {
		stage = await SlowModeStage.create({
			threshold,
			limit
		});
		await slowMode.addStage(stage);
		await slowMode.reload({ include: 'stages' });
	}

	const auditLogEmbed = new EmbedBuilder()
		.setColor(0xC0C0C0)
		.setTitle('Event Type: _Auto Slow-Mode Threshold Set_')
		.setDescription('――――――――――――――――――――――――――――――――――')
		.setFields(
			{
				name: 'User',
				value: `<@${interaction.user.id}>`
			},
			{
				name: 'Channel',
				value: `<#${channel.id}>`
			},
			{
				name: 'New Threshold',
				value: `Limit of 1 message every ${limit} seconds above ${threshold} messages per minute`
			}
		).setFooter({
			text: 'Pretendo Network',
			iconURL: interaction.guild!.iconURL()!
		});

	if (oldLimit) {
		auditLogEmbed.addFields([
			{
				name: 'Old Threshold',
				value: `Limit of 1 message every ${oldLimit} seconds above ${threshold} messages per minute`
			}
		]);
	}

	if (slowMode.stages && slowMode.stages.length > 0) {
		const stagesMessage = slowMode.stages.sort((a, b) => a.threshold - b.threshold).map(stage => {
			return `1 message every ${stage.limit}s above ${stage.threshold} messages per minute`;
		}).join('\n');
	
		auditLogEmbed.addFields([
			{
				name: 'Configured stages',
				value: stagesMessage
			}
		]);
	}
		
	await sendEventLogMessage(interaction.guild!, channel.id, auditLogEmbed);

	await interaction.followUp({ content: `Set a limit of 1 message every ${limit} seconds above ${threshold} messages per minute on <#${channel.id}>` });
}

async function unsetStageHandler(interaction: ChatInputCommandInteraction): Promise<void> {
	await interaction.deferReply({ ephemeral: true });

	const channel = interaction.options.getChannel('channel') ?? interaction.channel;
	if (!channel) {
		throw new Error('No channel given');
	}

	if (channel.type !== ChannelType.GuildText) {
		throw new Error('Slow mode only applies to text channels');
	}

	const slowMode = await SlowMode.findOne({
		where: {
			channel_id: channel.id
		},
		include: 'stages'
	});

	if (!slowMode) {
		throw new Error(`No slow mode set for <#${channel.id}>`);
	}

	const threshold = interaction.options.getInteger('threshold', true);

	const stage = slowMode.stages?.find(stage => stage.threshold === threshold);
	if (!stage) {
		throw new Error(`No stage set at ${threshold} messages per minute`);
	}

	const oldLimit = stage.limit;
	await slowMode.destroy();
	await slowMode.reload({ include: 'stages' });

	const auditLogEmbed = new EmbedBuilder()
		.setColor(0xC0C0C0)
		.setTitle('Event Type: _Auto Slow-Mode Threshold Unset_')
		.setDescription('――――――――――――――――――――――――――――――――――')
		.setFields(
			{
				name: 'User',
				value: `<@${interaction.user.id}>`
			},
			{
				name: 'Channel',
				value: `<#${channel.id}>`
			},
			{
				name: 'Old Threshold',
				value: `Limit of 1 message every ${oldLimit} seconds above ${threshold} messages per minute`
			}
		).setFooter({
			text: 'Pretendo Network',
			iconURL: interaction.guild!.iconURL()!
		});

	if (slowMode.stages && slowMode.stages.length > 0) {
		const stagesMessage = slowMode.stages.sort((a, b) => a.threshold - b.threshold).map(stage => {
			return `1 message every ${stage.limit}s above ${stage.threshold} messages per minute`;
		}).join('\n');
	
		auditLogEmbed.addFields([
			{
				name: 'Configured stages',
				value: stagesMessage
			}
		]);
	}
		
	await sendEventLogMessage(interaction.guild!, channel.id, auditLogEmbed);

	await interaction.followUp({ content: `Unset the limit at ${threshold} messages per minute on <#${channel.id}>` });
}

async function enableAutoSlowModeHandler(interaction: ChatInputCommandInteraction): Promise<void> {
	await interaction.deferReply({ ephemeral: true });

	const channel = interaction.options.getChannel('channel') ?? interaction.channel;
	if (!channel) {
		throw new Error('No channel given');
	}

	if (channel.type !== ChannelType.GuildText) {
		throw new Error('Slow mode only applies to text channels');
	}

	let slowMode = await SlowMode.findOne({
		where: {
			channel_id: channel.id
		},
		include: 'stages'
	});

	if (slowMode) {
		slowMode.enabled = true;
	} else {
		slowMode = await SlowMode.create({
			channel_id: channel.id,
			window: 60000,
			enabled: true
		});
	}

	const window = interaction.options.getInteger('window');
	if (window) {
		slowMode.window = window;
	}

	await slowMode.save();

	// * This returns a Promise but is specifically not awaited as it should spawn its own loop
	handleSlowMode(interaction.guild!, slowMode);

	const auditLogEmbed = new EmbedBuilder()
		.setColor(0xC0C0C0)
		.setTitle('Event Type: _Auto Slow-Mode Enabled_')
		.setDescription('――――――――――――――――――――――――――――――――――')
		.setFields(
			{
				name: 'User',
				value: `<@${interaction.user.id}>`
			},
			{
				name: 'Channel',
				value: `<#${channel.id}>`
			}
		).setFooter({
			text: 'Pretendo Network',
			iconURL: interaction.guild!.iconURL()!
		});

	if (slowMode.stages && slowMode.stages.length > 0) {
		const stagesMessage = slowMode.stages.map(stage => {
			return `1 message every ${stage.limit}s above ${stage.threshold} messages per minute`;
		}).join('\n');
	
		auditLogEmbed.addFields([
			{
				name: 'Configured stages',
				value: stagesMessage
			}
		]);
	}

	await sendEventLogMessage(interaction.guild!, channel.id, auditLogEmbed);

	await interaction.followUp({ content: `Auto slow mode enabled for <#${channel.id}>` });
}

async function enableStaticSlowModeHandler(interaction: ChatInputCommandInteraction): Promise<void> {
	await interaction.deferReply({ ephemeral: true });

	const channel = interaction.options.getChannel('channel', false, [ChannelType.GuildText]) ?? interaction.channel;
	if (!channel) {
		throw new Error('No channel given');
	}

	if (channel.type !== ChannelType.GuildText) {
		throw new Error('Slow mode only applies to text channels');
	}

	const slowMode = await SlowMode.findOne({
		where: {
			channel_id: channel.id
		},
		include: 'stages'
	});

	if (slowMode) {
		slowMode.enabled = false;
		await slowMode.save();
	}

	const limit = interaction.options.getInteger('limit', true);
	channel.setRateLimitPerUser(limit);

	const auditLogEmbed = new EmbedBuilder()
		.setColor(0xC0C0C0)
		.setTitle('Event Type: _Static Slow-Mode Enabled_')
		.setDescription('――――――――――――――――――――――――――――――――――')
		.setFields(
			{
				name: 'User',
				value: `<@${interaction.user.id}>`
			},
			{
				name: 'Channel',
				value: `<#${channel.id}>`
			},
			{
				name: 'Limit',
				value: `1 message every ${limit} seconds`
			}
		).setFooter({
			text: 'Pretendo Network',
			iconURL: interaction.guild!.iconURL()!
		});

	await sendEventLogMessage(interaction.guild!, channel.id, auditLogEmbed);

	await interaction.followUp({ content: `Static slow mode enabled for <#${channel.id}>` });
}

async function disableSlowModeHandler(interaction: ChatInputCommandInteraction): Promise<void> {
	await interaction.deferReply({ ephemeral: true });

	const channel = interaction.options.getChannel('channel', false, [ChannelType.GuildText]) ?? interaction.channel;
	if (!channel) {
		throw new Error('No channel given');
	}

	if (channel.type !== ChannelType.GuildText) {
		throw new Error('Slow mode only applies to text channels');
	}

	const slowMode = await SlowMode.findOne({
		where: {
			channel_id: channel.id
		}
	});

	if ((!slowMode || !slowMode.enabled) && channel.rateLimitPerUser === 0) {
		throw new Error(`Slow mode for <#${channel.id}> is already disabled`);
	}

	if (slowMode && slowMode.enabled === true) {
		slowMode.enabled = false;
		await slowMode.save();
	}

	await channel.setRateLimitPerUser(0);

	const auditLogEmbed = new EmbedBuilder()
		.setColor(0xC0C0C0)
		.setTitle('Event Type: _Slow-Mode Disabled_')
		.setDescription('――――――――――――――――――――――――――――――――――')
		.setFields(
			{
				name: 'User',
				value: `<@${interaction.user.id}>`
			},
			{
				name: 'Channel',
				value: `<#${channel.id}>`
			}
		).setFooter({
			text: 'Pretendo Network',
			iconURL: interaction.guild!.iconURL()!
		});

	await sendEventLogMessage(interaction.guild!, channel.id, auditLogEmbed);

	await interaction.followUp({ content: `Slow mode disabled for <#${channel.id}>` });
}

async function slowModeStatsHandler(interaction: ChatInputCommandInteraction): Promise<void> {
	await interaction.deferReply({ ephemeral: true });

	const channel = interaction.options.getChannel('channel', false, [ChannelType.GuildText]) ?? interaction.channel;
	if (!channel) {
		throw new Error('No channel given');
	}

	if (channel.type !== ChannelType.GuildText) {
		throw new Error('Slow mode only applies to text channels');
	}

	const slowMode = await SlowMode.findOne({
		where: {
			channel_id: channel.id
		},
		include: 'stages'
	});

	if (channel.rateLimitPerUser === 0) {
		if (!slowMode || !slowMode.enabled) {
			throw new Error(`No slow mode set for <#${channel.id}>`);
		}
	}

	const embed = new EmbedBuilder()
		.setTitle('Slow mode stats')
		.setFields([
			{
				name: 'Channel',
				value: `<#${channel.id}>`
			},
		])
		.setFooter({
			text: 'Pretendo Network',
			iconURL: interaction.guild!.iconURL()!
		});
	
	if (slowMode && slowMode.enabled) {
		if (slowMode.users) {
			embed.addFields([
				{
					name: 'Participating Users',
					value: slowMode.users.toString()
				}
			]);
		}
		
		if (slowMode.rate) {
			embed.addFields([
				{
					name: 'Current Rate',
					value: slowMode.rate.toString()
				}
			]);
		}

		embed.addFields([
			{
				name: 'Current Limit',
				value: `1 message every ${channel.rateLimitPerUser} seconds`
			},
			{
				name: 'Window',
				value: `${(slowMode.window / 1000).toString()} seconds`
			}
		]);

		if (slowMode.stages && slowMode.stages.length > 0) {
			const stagesMessage = slowMode.stages.sort((a, b) => a.threshold - b.threshold).map(stage => {
				return `1 message every ${stage.limit}s above ${stage.threshold} messages per minute`;
			}).join('\n');
		
			embed.addFields([
				{
					name: 'Configured stages',
					value: stagesMessage
				}
			]);
		}
	} else {
		embed.addFields([
			{
				name: 'Current limit',
				value: `1 message every ${channel.rateLimitPerUser} seconds`
			}
		]);
	}

	await interaction.followUp({ embeds: [embed] });
}

const command = new SlashCommandBuilder()
	.setDefaultMemberPermissions('0')
	.setName('slow-mode')
	.setDescription('Configure slow mode for a channel')
	.addSubcommandGroup(group => {
		group.setName('enable')
			.setDescription('Enable slow mode for a channel')
			.addSubcommand(cmd => {
				cmd.setName('auto')
					.setDescription('Enable auto slow mode')
					.addChannelOption(option => {
						option.setName('channel')
							.setDescription('The channel to enable auto slow mode for');
						return option;
					})
					.addIntegerOption(option => {
						option.setName('window')
							.setDescription('The time window to use for calculating message rate')
							.setMinValue(10000)
							.setMaxValue(1000 * 60 * 60);
						return option;
					});
				return cmd;
			})
			.addSubcommand(cmd =>{
				cmd.setName('static')
					.setDescription('Enable static slow mode')
					.addIntegerOption(option => {
						option.setName('limit')
							.setDescription('The static limit to set the channel slow mode to')
							.setMinValue(1)
							.setMaxValue(21600)
							.setRequired(true);
						return option;
					})
					.addChannelOption(option => {
						option.setName('channel')
							.setDescription('The channel to enable static slow mode for');
						return option;
					});
				return cmd;
			});
		return group;
	})
	.addSubcommand(cmd => {
		cmd.setName('disable')
			.setDescription('Disable slow mode for a channel')
			.addChannelOption(option => {
				option.setName('channel')
					.setDescription('The channel to disable auto slow mode for');
				return option;
			});
		return cmd;
	})
	.addSubcommand(cmd => {
		cmd.setName('stats')
			.setDescription('Get the current auto slow mode stats for a channel')
			.addChannelOption(option => {
				option.setName('channel')
					.setDescription('The channel to fetch the auto slow mode stats for');
				return option;
			});
		return cmd;
	})
	.addSubcommandGroup(group => {
		group.setName('stage')
			.setDescription('Managed the auto slow mode threshold settings')
			.addSubcommand(cmd => {
				cmd.setName('set')
					.setDescription('Set the properties of a stage for the given channel')
					.addIntegerOption(option => {
						option.setName('threshold')
							.setDescription('the threshold in messages per section that must be reached to enable this stage')
							.setRequired(true)
							.setMinValue(0);
						return option;
					})
					.addIntegerOption(option => {
						option.setName('limit')
							.setDescription('the limit to apply to the channel once the threshold has been reached')
							.setRequired(true)
							.setMinValue(1)
							.setMaxValue(21600);
						return option;
					})
					.addChannelOption(option => {
						option.setName('channel')
							.setDescription('The channel to add a threshold for');
						return option;
					});
				return cmd;
			})
			.addSubcommand(cmd => {
				cmd.setName('unset')
					.setDescription('Unset a stage for the given channel')
					.addIntegerOption(option => {
						option.setName('threshold')
							.setDescription('The index of the threshold to remove')
							.setMinValue(0)
							.setRequired(true);
						return option;
					})
					.addChannelOption(option => {
						option.setName('channel')
							.setDescription('The channel to remove a threshold for');
						return option;
					});
				return cmd;
			});
		return group;
	});

export default {
	name: command.name,
	handler: slowModeHandler,
	deploy: command.toJSON()
};