/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.listeners;

import com.chalwk.config.Constants;
import net.dv8tion.jda.api.entities.Role;
import net.dv8tion.jda.api.events.guild.member.GuildMemberJoinEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class AutoRoleListener extends ListenerAdapter {
    private static final Logger logger = LoggerFactory.getLogger(AutoRoleListener.class);

    @Override
    public void onGuildMemberJoin(@NotNull GuildMemberJoinEvent event) {
        try {
            long pilotUnderTrainingRoleId = Constants.ROLE_PILOT_UNDER_TRAINING;

            if (pilotUnderTrainingRoleId == 0L) {
                logger.warn("Pilot Under Training role ID is not configured. Auto-role feature disabled.");
                return;
            }

            Role pilotUnderTrainingRole = event.getGuild().getRoleById(pilotUnderTrainingRoleId);

            if (pilotUnderTrainingRole == null) {
                logger.error("Pilot Under Training role not found with ID: {}", pilotUnderTrainingRoleId);
                return;
            }

            event.getGuild().addRoleToMember(event.getMember(), pilotUnderTrainingRole).queue(
                    success -> {
                        logger.info("Assigned Pilot Under Training role to {} ({})",
                                event.getUser().getAsTag(),
                                event.getUser().getId());
                        sendWelcomeMessage(event);
                    },
                    error -> {
                        logger.error("Failed to assign Pilot Under Training role to {}: {}",
                                event.getUser().getAsTag(),
                                error.getMessage());
                    }
            );

        } catch (Exception e) {
            logger.error("Error in auto-role assignment for {}: {}",
                    event.getUser().getAsTag(),
                    e.getMessage());
        }
    }

    private void sendWelcomeMessage(GuildMemberJoinEvent event) {
        String welcomeMessage = String.format(
                "👋 Welcome to Coastal Peaks Air Service, %s!\n" +
                        "You've been automatically assigned the **Pilot Under Training** role.\n" +
                        "Check out our documentation and use `/help` to get started!\n" +
                        "Website: %s",
                event.getUser().getAsMention(),
                Constants.BOT_WEBSITE
        );

        if (event.getGuild().getSystemChannel() != null) {
            event.getGuild().getSystemChannel().sendMessage(welcomeMessage).queue();
        }
    }
}