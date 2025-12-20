/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.commands.general;

import com.chalwk.commands.CommandManager;
import com.chalwk.config.Constants;
import net.dv8tion.jda.api.EmbedBuilder;
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import net.dv8tion.jda.api.interactions.commands.build.Commands;
import net.dv8tion.jda.api.interactions.commands.build.SlashCommandData;
import org.jetbrains.annotations.NotNull;

public class HelpCommand extends ListenerAdapter implements CommandManager {

    @Override
    public String getCommandName() {
        return "help";
    }

    @Override
    public SlashCommandData getCommandData() {
        return Commands.slash(getCommandName(), "Show help information about the bot");
    }

    @Override
    public void onSlashCommandInteraction(@NotNull SlashCommandInteractionEvent event) {
        if (!event.getName().equals(getCommandName())) return;
        handleCommand(event);
    }

    @Override
    public void handleCommand(SlashCommandInteractionEvent event) {
        try {
            EmbedBuilder embed = new EmbedBuilder()
                    .setTitle("🤖 CPAS Discord Bot Help")
                    .setColor(Constants.BOT_COLOR)
                    .setDescription("Here are all the available commands:");

            embed.addField("📋 General Commands", """
                    `/pirep` - Submit a pilot report
                    `/help` - Show this help message
                    """, false);

            embed.addField("🔗 Useful Links",
                    String.format("[Website](%s) | [GitHub](%s)",
                            Constants.BOT_WEBSITE, Constants.BOT_GITHUB), false);

            embed.setFooter("Coastal Peaks Air Service", null);

            event.replyEmbeds(embed.build())
                    .setEphemeral(true)
                    .queue();

        } catch (Exception e) {
            event.reply("❌ An error occurred while showing help.")
                    .setEphemeral(true)
                    .queue();
        }
    }
}