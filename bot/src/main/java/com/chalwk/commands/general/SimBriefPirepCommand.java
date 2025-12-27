/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.commands.general;

import com.chalwk.api.SimBriefAPI;
import com.chalwk.commands.CommandManager;
import com.chalwk.config.Constants;
import com.chalwk.data.FlightDataManager;
import net.dv8tion.jda.api.EmbedBuilder;
import net.dv8tion.jda.api.components.actionrow.ActionRow;
import net.dv8tion.jda.api.components.buttons.Button;
import net.dv8tion.jda.api.entities.MessageEmbed;
import net.dv8tion.jda.api.events.interaction.command.SlashCommandInteractionEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import net.dv8tion.jda.api.interactions.commands.OptionType;
import net.dv8tion.jda.api.interactions.commands.build.Commands;
import net.dv8tion.jda.api.interactions.commands.build.OptionData;
import net.dv8tion.jda.api.interactions.commands.build.SlashCommandData;
import org.jetbrains.annotations.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.w3c.dom.Document;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

public class SimBriefPirepCommand extends ListenerAdapter implements CommandManager {
    private static final Logger logger = LoggerFactory.getLogger(SimBriefPirepCommand.class);
    private static final List<String> VALID_STATUSES = Arrays.asList(
            "completed", "in-progress", "scheduled", "cancelled", "diverted"
    );

    @Override
    public String getCommandName() {
        return "pirep";
    }

    @Override
    public SlashCommandData getCommandData() {
        return Commands.slash(getCommandName(), "Submit a PIREP using your latest SimBrief flight plan")
                .addOptions(
                        new OptionData(OptionType.STRING, "userid",
                                "Your SimBrief numeric Pilot/User ID", true)
                                .setMaxLength(10),
                        new OptionData(OptionType.STRING, "status",
                                "Status of the flight (default: completed)", false)
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
            event.deferReply(true).queue();

            String simbriefPilotId = event.getOption("userid").getAsString().trim();

            String status;
            if (event.getOption("status") != null) {
                status = event.getOption("status").getAsString().trim().toLowerCase();
                if (!VALID_STATUSES.contains(status)) {
                    event.getHook().editOriginal("❌ Invalid status. Valid statuses are: " + String.join(", ", VALID_STATUSES))
                            .queue();
                    return;
                }
            } else {
                status = "completed";
            }

            if (simbriefPilotId.isEmpty()) {
                event.getHook().editOriginal("❌ Please provide your SimBrief Pilot ID.")
                        .queue();
                return;
            }

            try {
                Document doc = SimBriefAPI.fetchFlightPlanByUserId(simbriefPilotId);
                Map<String, String> flightPlan = SimBriefAPI.parseFlightPlan(doc);

                if (flightPlan.containsKey("error")) {
                    event.getHook().editOriginal("❌ Error: " + flightPlan.get("error"))
                            .queue();
                    return;
                }

                if (flightPlan.get("origin") == null || flightPlan.get("origin").isEmpty() ||
                        flightPlan.get("destination") == null || flightPlan.get("destination").isEmpty()) {
                    event.getHook().editOriginal("❌ Invalid flight plan data. The flight plan might be incomplete or private.")
                            .queue();
                    return;
                }

                String flightNumber = flightPlan.get("flight_number");
                if (FlightDataManager.isFlightDuplicate(flightNumber, simbriefPilotId)) {
                    event.getHook().editOriginal("❌ This flight plan has already been submitted! Flight ID: " + flightNumber)
                            .queue();
                    return;
                }

                flightPlan.put("status", status);

                MessageEmbed pirepEmbed = createSimBriefPirepEmbed(
                        event.getUser(),
                        flightPlan
                );

                String buttonUrl;
                String buttonLabel;

                if (flightPlan.containsKey("pdf_url") && flightPlan.get("pdf_url") != null &&
                        !flightPlan.get("pdf_url").isEmpty()) {
                    buttonUrl = flightPlan.get("pdf_url");
                    buttonLabel = "View PDF OFP";
                } else {
                    buttonUrl = "https://www.simbrief.com/ofp/uads/?userid=" + simbriefPilotId;
                    buttonLabel = "View Full OFP";
                }

                if (Constants.CHANNEL_PIREP != 0) {
                    var channel = event.getGuild().getTextChannelById(Constants.CHANNEL_PIREP);
                    if (channel != null) {
                        var messageAction = channel.sendMessageEmbeds(pirepEmbed);

                        messageAction = messageAction.setComponents(
                                ActionRow.of(Button.link(buttonUrl, buttonLabel))
                        );

                        messageAction.queue(
                                success -> {
                                    event.getHook().editOriginal("✅ PIREP submitted successfully from SimBrief!")
                                            .queue();
                                    logger.info("SimBrief PIREP submitted by {} (SimBrief ID: {}): {} -> {}, Status: {}",
                                            event.getUser().getAsTag(),
                                            simbriefPilotId,
                                            flightPlan.get("origin"),
                                            flightPlan.get("destination"),
                                            status);

                                    try {
                                        FlightDataManager.saveFlight(event.getUser(), flightPlan, simbriefPilotId, status);
                                    } catch (Exception e) {
                                        logger.warn("Failed to save flight to JSON (non-critical): {}", e.getMessage());
                                    }
                                },
                                error -> {
                                    event.getHook().editOriginal("❌ Failed to submit PIREP. Please try again.")
                                            .queue();
                                    logger.error("Failed to send SimBrief PIREP", error);
                                }
                        );
                    } else {
                        event.getHook().editOriginal("❌ PIREP channel not found. Please contact an administrator.")
                                .queue();
                    }
                } else {
                    event.getHook().editOriginal("❌ PIREP channel not configured. Please contact an administrator.")
                            .queue();
                }

            } catch (Exception e) {
                logger.error("Error fetching SimBrief data for userid: {}", simbriefPilotId, e);
                event.getHook().editOriginal("❌ Could not fetch your latest SimBrief flight plan.\n" +
                                "**Please check:**\n" +
                                "• Is your Pilot ID **" + simbriefPilotId + "** correct?\n" +
                                "• Have you generated a flight plan recently?\n" +
                                "• Is your SimBrief profile set to public?\n\n" +
                                "**Find your ID:** Log into SimBrief, go to **Account Settings**. Your numeric 'Pilot ID' or 'User ID' is listed there.")
                        .queue();
            }

        } catch (Exception e) {
            event.getHook().editOriginal("❌ An error occurred while processing your PIREP.")
                    .queue();
            logger.error("Error in SimBrief PIREP command", e);
        }
    }

    private MessageEmbed createSimBriefPirepEmbed(net.dv8tion.jda.api.entities.User user,
                                                  Map<String, String> flightPlan) {

        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));

        String status = flightPlan.getOrDefault("status", "completed");
        String statusEmoji = getStatusEmoji(status);
        String statusText = capitalizeFirstLetter(status.replace("-", " "));

        EmbedBuilder embed = new EmbedBuilder()
                .setTitle("📋 SimBrief PIREP - " + flightPlan.get("flight_number"))
                .setColor(getStatusColor(status))
                .setAuthor(user.getAsTag(), null, user.getEffectiveAvatarUrl())
                .setThumbnail("https://www.simbrief.com/images/sb_logo_small.png")
                .setFooter("Submitted at " + timestamp + " | Coastal Peaks Air Service");

        embed.addField(statusEmoji + " Status", statusText, true);

        String aircraft = flightPlan.containsKey("aircraft_name") && flightPlan.get("aircraft_name") != null &&
                !flightPlan.get("aircraft_name").isEmpty() ?
                String.format("%s (%s)\n%s",
                        flightPlan.get("aircraft_name"),
                        flightPlan.get("aircraft_icao"),
                        flightPlan.get("aircraft_reg")) :
                "Not specified";

        embed.addField("✈️ Aircraft", aircraft, true);

        embed.addField("📍 Route", String.format("%s → %s\nAlt: %s",
                        flightPlan.get("origin"),
                        flightPlan.get("destination"),
                        flightPlan.getOrDefault("alternate", "N/A")),
                true);

        if (flightPlan.containsKey("flight_time")) {
            embed.addField("⏱️ Times", String.format("Flight: %s\nBlock: %s",
                            flightPlan.get("flight_time"),
                            flightPlan.get("block_time")),
                    true);
        }

        String routeText = flightPlan.getOrDefault("route_text", "Direct");
        if (routeText != null && routeText.length() > 200) {
            routeText = routeText.substring(0, 197) + "...";
        }
        embed.addField("🛣️ Route", routeText != null ? routeText : "Direct", false);

        return embed.build();
    }

    private int getStatusColor(String status) {
        return switch (status) {
            case "completed" -> 0x059669; // Green
            case "in-progress" -> 0xf59e0b; // Yellow
            case "scheduled" -> 0x3b82f6; // Blue
            case "cancelled" -> 0xef4444; // Red
            case "diverted" -> 0x8b5cf6; // Purple
            default -> 0x2D6BC9; // Original blue
        };
    }

    private String getStatusEmoji(String status) {
        return switch (status) {
            case "completed" -> "✅";
            case "in-progress", "diverted" -> "🔄";
            case "scheduled" -> "📅";
            case "cancelled" -> "❌";
            default -> "📋";
        };
    }

    private String capitalizeFirstLetter(String str) {
        if (str == null || str.isEmpty()) return str;
        return str.substring(0, 1).toUpperCase() + str.substring(1);
    }
}