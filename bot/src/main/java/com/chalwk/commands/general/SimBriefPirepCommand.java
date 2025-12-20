/* Copyright (c) 2025. Jericho Crosby (Chalwk) */

package com.chalwk.commands.general;

import com.chalwk.api.SimBriefAPI;
import com.chalwk.commands.CommandManager;
import com.chalwk.config.Constants;
import com.chalwk.utils.PermissionChecker;
import net.dv8tion.jda.api.EmbedBuilder;
import net.dv8tion.jda.api.components.actionrow.ActionRow;
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
import java.util.Map;

public class SimBriefPirepCommand extends ListenerAdapter implements CommandManager {
    private static final Logger logger = LoggerFactory.getLogger(SimBriefPirepCommand.class);

    @Override
    public String getCommandName() {
        return "simbrief-pirep";
    }

    @Override
    public SlashCommandData getCommandData() {
        return Commands.slash(getCommandName(), "Submit a PIREP using your latest SimBrief flight plan")
                .addOptions(
                        new OptionData(OptionType.STRING, "userid",
                                "Your SimBrief numeric Pilot/User ID", true)
                                .setMaxLength(10)
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
            if (!hasAccessToPirep(event.getMember())) {
                event.reply("❌ You don't have permission to submit PIREPs. You need to be assigned a pilot role!")
                        .setEphemeral(true)
                        .queue();
                return;
            }

            event.deferReply().queue();
            String userId = event.getOption("userid").getAsString().trim();

            if (userId.isEmpty()) {
                event.getHook().editOriginal("❌ Please provide your SimBrief Pilot ID.")
                        .queue();
                return;
            }

            try {
                Document doc = SimBriefAPI.fetchFlightPlanByUserId(userId);
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

                MessageEmbed pirepEmbed = createSimBriefPirepEmbed(
                        event.getUser(),
                        flightPlan
                );

                String ofpUrl = "https://www.simbrief.com/ofp/uads/?userid=" + userId;

                if (Constants.CHANNEL_PIREP != 0) {
                    var channel = event.getGuild().getTextChannelById(Constants.CHANNEL_PIREP);
                    if (channel != null) {
                        var messageAction = channel.sendMessageEmbeds(pirepEmbed);

                        messageAction = messageAction.setComponents(
                                ActionRow.of(net.dv8tion.jda.api.components.buttons.Button.link(ofpUrl, "View Full OFP"))
                        );

                        messageAction.queue(
                                success -> {
                                    event.getHook().editOriginal("✅ PIREP submitted successfully from SimBrief!")
                                            .queue();
                                    logger.info("SimBrief PIREP submitted by {}: {} -> {}",
                                            event.getUser().getAsTag(),
                                            flightPlan.get("origin"),
                                            flightPlan.get("destination"));
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
                logger.error("Error fetching SimBrief data for userid: {}", userId, e);
                event.getHook().editOriginal("❌ Could not fetch your latest SimBrief flight plan.\n" +
                                "**Please check:**\n" +
                                "• Is your Pilot ID **" + userId + "** correct?\n" +
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

    private boolean hasAccessToPirep(net.dv8tion.jda.api.entities.Member member) {
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

    private MessageEmbed createSimBriefPirepEmbed(net.dv8tion.jda.api.entities.User user,
                                                  Map<String, String> flightPlan) {

        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));

        EmbedBuilder embed = new EmbedBuilder()
                .setTitle("📋 SimBrief PIREP - " + flightPlan.get("flight_number"))
                .setColor(0x2D6BC9)
                .setAuthor(user.getAsTag(), null, user.getEffectiveAvatarUrl())
                .setThumbnail("https://www.simbrief.com/images/sb_logo_small.png")
                .setFooter("Submitted at " + timestamp + " | Coastal Peaks Air Service");

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
        if (flightPlan.containsKey("fuel_burn")) {
            embed.addField("📊 Performance", String.format("Fuel Burn: %s kg\nCruise: %s",
                            flightPlan.get("fuel_burn"),
                            flightPlan.get("cruise_alt")),
                    true);
        }

        if (flightPlan.containsKey("zfw")) {
            embed.addField("⚖️ Weights", String.format("ZFW: %s kg\nTOW: %s kg",
                            flightPlan.get("zfw"),
                            flightPlan.get("tow")),
                    true);
        }

        if (flightPlan.containsKey("wind_component")) {
            embed.addField("💨 Wind", "Avg Component: " + flightPlan.get("wind_component") + " kts", true);
        }

        return embed.build();
    }
}