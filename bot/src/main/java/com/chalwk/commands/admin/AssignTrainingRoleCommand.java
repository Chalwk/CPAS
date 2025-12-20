/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.commands.admin;

import com.chalwk.commands.CommandManager;
import com.chalwk.config.Constants;
import com.chalwk.utils.PermissionChecker;
import net.dv8tion.jda.api.entities.Member;
import net.dv8tion.jda.api.entities.Role;
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import net.dv8tion.jda.api.interactions.commands.build.Commands;
import net.dv8tion.jda.api.interactions.commands.build.SlashCommandData;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public class AssignTrainingRoleCommand extends ListenerAdapter implements CommandManager {
    private static final Logger logger = LoggerFactory.getLogger(AssignTrainingRoleCommand.class);

    @Override
    public String getCommandName() {
        return "assign-training";
    }

    @Override
    public SlashCommandData getCommandData() {
        return Commands.slash(getCommandName(), "Assign Pilot Under Training role to members without pilot roles (Admin only)");
    }

    @Override
    public void onSlashCommandInteraction(@NotNull SlashCommandInteractionEvent event) {
        if (!event.getName().equals(getCommandName())) return;
        handleCommand(event);
    }

    @Override
    public void handleCommand(SlashCommandInteractionEvent event) {
        try {
            if (!PermissionChecker.isAdmin(event.getMember())) {
                event.reply("❌ This command is for administrators only!")
                        .setEphemeral(true)
                        .queue();
                return;
            }

            event.deferReply(true).queue();

            Role pilotUnderTrainingRole = event.getGuild().getRoleById(Constants.ROLE_PILOT_UNDER_TRAINING);

            if (pilotUnderTrainingRole == null) {
                event.getHook().editOriginal("❌ Pilot Under Training role not found. Please check the configuration.")
                        .queue();
                return;
            }

            List<Member> members = event.getGuild().loadMembers().get();
            AtomicInteger assignedCount = new AtomicInteger(0);

            for (Member member : members) {
                boolean hasPilotRole = member.getRoles().stream()
                        .anyMatch(role ->
                                role.getIdLong() == Constants.ROLE_PILOT_UNDER_TRAINING ||
                                        role.getIdLong() == Constants.ROLE_CHARTER_PILOT ||
                                        role.getIdLong() == Constants.ROLE_SENIOR_CHARTER_PILOT ||
                                        role.getIdLong() == Constants.ROLE_LEAD_PILOT ||
                                        role.getIdLong() == Constants.ROLE_INSTRUCTOR
                        );

                if (!hasPilotRole && !member.getUser().isBot()) {
                    event.getGuild().addRoleToMember(member, pilotUnderTrainingRole).queue();
                    assignedCount.incrementAndGet();
                }
            }

            event.getHook().editOriginal(String.format(
                    "✅ Successfully assigned Pilot Under Training role to %d members who didn't have any pilot role.",
                    assignedCount.get()
            )).queue();

        } catch (Exception e) {
            logger.error("Error in assign-training command", e);
            event.getHook().editOriginal("❌ An error occurred while assigning roles.")
                    .queue();
        }
    }
}