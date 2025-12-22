/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.commands.general;

import com.chalwk.commands.CommandManager;
import com.chalwk.config.Constants;
import com.chalwk.github.GitHubAPI;
import com.chalwk.utils.PermissionChecker;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import net.dv8tion.jda.api.EmbedBuilder;
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import net.dv8tion.jda.api.interactions.commands.OptionType;
import net.dv8tion.jda.api.interactions.commands.build.Commands;
import net.dv8tion.jda.api.interactions.commands.build.OptionData;
import net.dv8tion.jda.api.interactions.commands.build.SlashCommandData;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.List;

public class UpdateFlightCommand extends ListenerAdapter implements CommandManager {
    private static final Logger logger = LoggerFactory.getLogger(UpdateFlightCommand.class);
    private static final ObjectMapper mapper = new ObjectMapper();
    private static final List<String> VALID_STATUSES = Arrays.asList("completed", "in-progress", "scheduled", "cancelled", "diverted");
    private static final String FLIGHTS_FILE_PATH = "data/flights.json";

    @Override
    public String getCommandName() {
        return "updateflight";
    }

    @Override
    public SlashCommandData getCommandData() {
        return Commands.slash(getCommandName(), "Update the status of your flight")
                .addOptions(
                        new OptionData(OptionType.STRING, "flight_id",
                                "Flight ID (e.g., CPA1234)", true),
                        new OptionData(OptionType.STRING, "status",
                                "New status for the flight", true)
                                .addChoice("Completed", "completed")
                                .addChoice("In Progress", "in-progress")
                                .addChoice("Scheduled", "scheduled")
                                .addChoice("Cancelled", "cancelled")
                                .addChoice("Diverted", "diverted")
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
            if (!hasAccessToUpdateFlight(event.getMember())) {
                event.reply("❌ You don't have permission to update flights. You need to be assigned a pilot role!")
                        .setEphemeral(true)
                        .queue();
                return;
            }

            event.deferReply().queue();

            String flightId = event.getOption("flight_id").getAsString().trim().toUpperCase();
            String newStatus = event.getOption("status").getAsString().trim().toLowerCase();

            if (!VALID_STATUSES.contains(newStatus)) {
                event.getHook().editOriginal("❌ Invalid status. Valid statuses are: " + String.join(", ", VALID_STATUSES))
                        .queue();
                return;
            }

            try {
                String existingJson = GitHubAPI.getFlightsJSON();
                if (existingJson == null || existingJson.isEmpty()) {
                    event.getHook().editOriginal("❌ No flights found in the database.")
                            .queue();
                    return;
                }

                ArrayNode flightsArray = (ArrayNode) mapper.readTree(existingJson);
                boolean flightFound = false;
                com.fasterxml.jackson.databind.JsonNode targetFlight = null;

                for (int i = 0; i < flightsArray.size(); i++) {
                    var flight = flightsArray.get(i);
                    if (flight.has("id") && flight.get("id").asText().equalsIgnoreCase(flightId)) {
                        flightFound = true;
                        targetFlight = flight;
                        break;
                    }
                }

                if (!flightFound) {
                    event.getHook().editOriginal("❌ Flight ID **" + flightId + "** not found.")
                            .queue();
                    return;
                }

                String pilotName = targetFlight.has("pilot") ? targetFlight.get("pilot").asText() : "";
                String discordName = event.getUser().getName();

                boolean isOwner = pilotName.equalsIgnoreCase(discordName) ||
                        PermissionChecker.isAdmin(event.getMember());

                if (!isOwner) {
                    event.getHook().editOriginal("❌ You can only update your own flights.")
                            .queue();
                    return;
                }

                String oldStatus = targetFlight.has("status") ? targetFlight.get("status").asText() : "unknown";

                ((ObjectNode) targetFlight)
                        .put("status", newStatus)
                        .put("lastUpdated", LocalDateTime.now()
                                .format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));

                String updatedJson = mapper.writerWithDefaultPrettyPrinter()
                        .writeValueAsString(flightsArray);

                boolean success = GitHubAPI.updateFile(updatedJson,
                        "Update flight status: " + flightId + " from " + oldStatus + " to " + newStatus,
                        FLIGHTS_FILE_PATH);

                if (success) {
                    sendFlightUpdateNotification(event, flightId, oldStatus, newStatus, targetFlight);

                    EmbedBuilder embed = new EmbedBuilder()
                            .setTitle("✅ Flight Status Updated")
                            .setColor(0x059669) // Green
                            .setDescription("Flight **" + flightId + "** status has been updated.")
                            .addField("Old Status", capitalize(oldStatus), true)
                            .addField("New Status", capitalize(newStatus), true)
                            .addField("Route",
                                    targetFlight.get("departure").asText() + " → " +
                                            targetFlight.get("arrival").asText(), false)
                            .setFooter("Updated by " + event.getUser().getAsTag() +
                                    " • " + LocalDateTime.now().format(
                                    DateTimeFormatter.ofPattern("MMM dd, yyyy HH:mm")))
                            .setThumbnail("https://cdn-icons-png.flaticon.com/512/190/190411.png");

                    event.getHook().editOriginalEmbeds(embed.build()).queue();
                    logger.info("Flight {} status updated from {} to {} by {}",
                            flightId, oldStatus, newStatus, event.getUser().getAsTag());
                } else {
                    event.getHook().editOriginal("❌ Failed to save the update. Please try again.")
                            .queue();
                }

            } catch (Exception e) {
                logger.error("Error updating flight status", e);
                event.getHook().editOriginal("❌ An error occurred while updating the flight status: " + e.getMessage())
                        .queue();
            }

        } catch (Exception e) {
            event.getHook().editOriginal("❌ An error occurred while processing your request.")
                    .queue();
            logger.error("Error in UpdateFlightCommand", e);
        }
    }

    private void sendFlightUpdateNotification(SlashCommandInteractionEvent event,
                                              String flightId,
                                              String oldStatus,
                                              String newStatus,
                                              com.fasterxml.jackson.databind.JsonNode flight) {
        try {
            if (Constants.CHANNEL_FLIGHT_UPDATES != 0) {
                var channel = event.getGuild().getTextChannelById(Constants.CHANNEL_FLIGHT_UPDATES);
                if (channel != null) {
                    EmbedBuilder notification = new EmbedBuilder()
                            .setTitle("📋 Flight Status Update")
                            .setColor(getStatusColor(newStatus))
                            .setDescription("Flight **" + flightId + "** has been updated.")
                            .addField("Pilot", flight.get("pilot").asText(), true)
                            .addField("Aircraft",
                                    flight.get("aircraftReg").asText() + " (" +
                                            flight.get("aircraftIcao").asText() + ")", true)
                            .addField("Route",
                                    flight.get("departure").asText() + " → " +
                                            flight.get("arrival").asText(), false)
                            .addField("Status Change",
                                    "```diff\n" +
                                            "- " + capitalize(oldStatus) + "\n" +
                                            "+ " + capitalize(newStatus) + "\n" +
                                            "```", false)
                            .setFooter("Updated by " + event.getUser().getAsTag() +
                                    " • " + LocalDateTime.now().format(
                                    DateTimeFormatter.ofPattern("MMM dd, yyyy HH:mm")))
                            .setThumbnail(event.getUser().getEffectiveAvatarUrl());

                    channel.sendMessageEmbeds(notification.build()).queue();
                }
            }
        } catch (Exception e) {
            logger.warn("Failed to send flight update notification", e);
        }
    }

    private int getStatusColor(String status) {
        return switch (status) {
            case "completed" -> 0x059669; // Green
            case "in-progress" -> 0xf59e0b; // Yellow
            case "scheduled" -> 0x3b82f6; // Blue
            case "cancelled" -> 0xef4444; // Red
            case "diverted" -> 0x8b5cf6; // Purple
            default -> 0x6b7280; // Gray
        };
    }

    private boolean hasAccessToUpdateFlight(net.dv8tion.jda.api.entities.Member member) {
        if (member == null) return false;
        if (PermissionChecker.isAdmin(member)) return true;

        return member.getRoles().stream()
                .anyMatch(role ->
                        role.getIdLong() == Constants.ROLE_PILOT_UNDER_TRAINING ||
                                role.getIdLong() == Constants.ROLE_CHARTER_PILOT ||
                                role.getIdLong() == Constants.ROLE_SENIOR_CHARTER_PILOT ||
                                role.getIdLong() == Constants.ROLE_LEAD_PILOT ||
                                role.getIdLong() == Constants.ROLE_INSTRUCTOR
                );
    }

    private String capitalize(String str) {
        if (str == null || str.isEmpty()) return str;
        return str.substring(0, 1).toUpperCase() + str.substring(1);
    }
}