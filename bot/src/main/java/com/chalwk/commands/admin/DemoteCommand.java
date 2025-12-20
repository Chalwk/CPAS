/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.commands.admin;

import com.chalwk.commands.CommandManager;
import com.chalwk.utils.CommandUtils;
import net.dv8tion.jda.api.entities.Member;
import net.dv8tion.jda.api.entities.Role;
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import net.dv8tion.jda.api.interactions.commands.OptionMapping;
import net.dv8tion.jda.api.interactions.commands.OptionType;
import net.dv8tion.jda.api.interactions.commands.build.Commands;
import net.dv8tion.jda.api.interactions.commands.build.OptionData;
import net.dv8tion.jda.api.interactions.commands.build.SlashCommandData;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class DemoteCommand extends ListenerAdapter implements CommandManager {
    private static final Logger logger = LoggerFactory.getLogger(DemoteCommand.class);

    @Override
    public String getCommandName() {
        return "demote";
    }

    @Override
    public SlashCommandData getCommandData() {
        return Commands.slash(getCommandName(), "Demote a member to a lower role")
                .addOptions(
                        new OptionData(OptionType.USER, "user", "The user to demote", true),
                        new OptionData(OptionType.STRING, "role", "Specific role to demote to")
                                .addChoices(CommandUtils.getRoleHierarchy().keySet().stream()
                                        .map(role -> new net.dv8tion.jda.api.interactions.commands.Command.Choice(role, role))
                                        .toList())
                );
    }

    @Override
    public void onSlashCommandInteraction(@NotNull SlashCommandInteractionEvent event) {
        if (!event.getName().equals(getCommandName())) return;
        handleCommand(event);
    }

    @Override
    public void handleCommand(SlashCommandInteractionEvent event) {
        try {
            if (!CommandUtils.checkAdminPermission(event, logger)) return;

            Member member = CommandUtils.getTargetMember(event, logger);
            if (member == null) return;

            OptionMapping roleOption = event.getOption("role");
            Role targetRole;

            if (roleOption != null) {
                String targetRoleName = roleOption.getAsString();
                targetRole = CommandUtils.getRoleByName(targetRoleName, event.getGuild());
                if (targetRole == null) {
                    CommandUtils.sendErrorReply(event,
                            "Role not found! Available roles: " +
                                    String.join(", ", CommandUtils.getRoleHierarchy().keySet()),
                            logger, null);
                    return;
                }
            } else {
                targetRole = CommandUtils.getPreviousRole(member, event.getGuild());
                if (targetRole == null) {
                    CommandUtils.sendErrorReply(event,
                            member.getEffectiveName() + " cannot be demoted further!",
                            logger, null);
                    return;
                }
            }

            List<Role> hierarchyRoles = CommandUtils.getAllHierarchyRoles(member);
            for (Role role : hierarchyRoles) {
                event.getGuild().removeRoleFromMember(member, role).queue();
            }

            Role finalTargetRole = targetRole;
            event.getGuild().addRoleToMember(member, targetRole)
                    .queue(
                            success -> {
                                CommandUtils.sendSuccessReply(event, "demoted", member, finalTargetRole);
                                CommandUtils.logAction("Demoted", member, finalTargetRole, event, logger);
                            },
                            error -> CommandUtils.sendErrorReply(event,
                                    "Failed to demote user: " + error.getMessage(),
                                    logger, error)
                    );

        } catch (Exception e) {
            CommandUtils.sendErrorReply(event,
                    "An error occurred: " + e.getMessage(),
                    logger, e);
        }
    }
}