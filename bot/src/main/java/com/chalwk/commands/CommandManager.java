/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.commands;

import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import net.dv8tion.jda.api.interactions.commands.build.SlashCommandData;

public interface CommandManager {
    String getCommandName();

    SlashCommandData getCommandData();

    void handleCommand(SlashCommandInteractionEvent event);
}