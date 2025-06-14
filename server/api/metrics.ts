import type { CopilotMetrics } from "@/model/Copilot_Metrics";
import { convertToMetrics } from '@/model/MetricsToUsageConverter';
import type { MetricsApiResponse } from "@/types/metricsApiResponse";
import type FetchError from 'ofetch';

// TODO: use for storage https://unstorage.unjs.io/drivers/azure

import { readFileSync } from 'fs';
import { resolve } from 'path';

export default defineEventHandler(async (event) => {

    const logger = console;
    const config = useRuntimeConfig(event);
    let apiUrl = '';
    let mockedDataPath: string;
    
    // Check for team query parameter to override team selection
    const query = getQuery(event);
    const teamSlug = query.team as string;

    // Determine the effective scope and team
    let effectiveScope = event.context.scope;
    let effectiveTeam = event.context.team;
    
    // If team query parameter is provided and we're in org scope, switch to team mode
    if (teamSlug && event.context.scope === 'org') {
        effectiveScope = 'team';
        effectiveTeam = teamSlug;
    }

    switch (effectiveScope) {
        case 'team':
            apiUrl = `https://api.github.com/orgs/${event.context.org}/team/${effectiveTeam}/copilot/metrics`;
            // no team test data available, using org data
            // '../../app/mock-data/organization_metrics_response_sample.json'
            mockedDataPath = resolve('public/mock-data/organization_metrics_response_sample.json');
            break;
        case 'org':
            apiUrl = `https://api.github.com/orgs/${event.context.org}/copilot/metrics`;
            mockedDataPath = resolve('public/mock-data/organization_metrics_response_sample.json');
            break;
        case 'ent':
            apiUrl = `https://api.github.com/enterprises/${event.context.ent}/copilot/metrics`;
            mockedDataPath = resolve('public/mock-data/enterprise_metrics_response_sample.json');
            break;
        default:
            return new Response('Invalid configuration/parameters for the request', { status: 400 });
    }

    if (config.public.isDataMocked && mockedDataPath) {
        const path = mockedDataPath;
        const data = readFileSync(path, 'utf8');
        const dataJson = JSON.parse(data);
        
        // If this is a team request, modify the data to show different numbers
        // so users can see that team selection is working
        if (effectiveScope === 'team' && effectiveTeam) {
          // Simulate some teams having no data (for teams with certain names)
          const noDataTeams = ['empty-team', 'no-activity', 'inactive'];
          if (noDataTeams.some(team => effectiveTeam.toLowerCase().includes(team))) {
            logger.info(`Using empty mocked data for team: ${effectiveTeam} (simulating team with no activity)`);
            return { metrics: [], usage: [] } as MetricsApiResponse;
          }
          
          // Reduce the numbers for team data to simulate team-specific metrics
          const teamData = JSON.parse(JSON.stringify(dataJson)); // Deep clone
          teamData.forEach((dayData: any) => {
            // Reduce all metrics by roughly half for team view
            if (dayData.copilot_ide_chat?.editors) {
              dayData.copilot_ide_chat.editors.forEach((editor: any) => {
                editor.models?.forEach((model: any) => {
                  model.total_chats = Math.floor(model.total_chats * 0.4);
                  model.total_engaged_users = Math.max(1, Math.floor(model.total_engaged_users * 0.5));
                  model.total_chat_copy_events = Math.floor(model.total_chat_copy_events * 0.3);
                  model.total_chat_insertion_events = Math.floor(model.total_chat_insertion_events * 0.3);
                });
                editor.total_engaged_users = Math.max(1, Math.floor(editor.total_engaged_users * 0.5));
              });
            }
            if (dayData.copilot_ide_code_completions?.editors) {
              dayData.copilot_ide_code_completions.editors.forEach((editor: any) => {
                editor.models?.forEach((model: any) => {
                  model.total_completions_suggested = Math.floor(model.total_completions_suggested * 0.3);
                  model.total_completions_accepted = Math.floor(model.total_completions_accepted * 0.3);
                  model.total_lines_suggested = Math.floor(model.total_lines_suggested * 0.3);
                  model.total_lines_accepted = Math.floor(model.total_lines_accepted * 0.3);
                  model.total_engaged_users = Math.max(1, Math.floor(model.total_engaged_users * 0.5));
                  if (model.languages) {
                    model.languages.forEach((lang: any) => {
                      lang.total_completions_suggested = Math.floor(lang.total_completions_suggested * 0.3);
                      lang.total_completions_accepted = Math.floor(lang.total_completions_accepted * 0.3);
                      lang.total_lines_suggested = Math.floor(lang.total_lines_suggested * 0.3);
                      lang.total_lines_accepted = Math.floor(lang.total_lines_accepted * 0.3);
                      lang.total_engaged_users = Math.max(1, Math.floor(lang.total_engaged_users * 0.5));
                    });
                  }
                });
                editor.total_engaged_users = Math.max(1, Math.floor(editor.total_engaged_users * 0.5));
              });
              dayData.copilot_ide_code_completions.total_engaged_users = Math.max(1, Math.floor(dayData.copilot_ide_code_completions.total_engaged_users * 0.5));
            }
          });
          
          // usage is the new API format
          const usageData = ensureCopilotMetrics(teamData);
          // metrics is the old API format
          const metricsData = convertToMetrics(usageData);

          logger.info(`Using mocked team data for team: ${effectiveTeam}`);
          return { metrics: metricsData, usage: usageData } as MetricsApiResponse;
        }
        
        // usage is the new API format
        const usageData = ensureCopilotMetrics(dataJson);
        // metrics is the old API format
        const metricsData = convertToMetrics(usageData);

        logger.info('Using mocked organization data');
        return { metrics: metricsData, usage: usageData } as MetricsApiResponse;
    }

    if (!event.context.headers.has('Authorization')) {
        logger.error('No Authentication provided');
        return new Response('No Authentication provided', { status: 401 });
    }

    logger.info(`Fetching metrics data from ${apiUrl}`);

    try {
        const response = await $fetch(apiUrl, {
            headers: event.context.headers
        }) as unknown[];

        // usage is the new API format
        const usageData = ensureCopilotMetrics(response as CopilotMetrics[]);
        // metrics is the old API format
        const metricsData = convertToMetrics(usageData);
        return { metrics: metricsData, usage: usageData } as MetricsApiResponse;
    } catch (error: FetchError) {
        logger.error('Error fetching metrics data:', error);
        return new Response('Error fetching metrics data: ' + error, { status: error.statusCode || 500 });
    }
})

function ensureCopilotMetrics(data: CopilotMetrics[]): CopilotMetrics[] {
    return data.map(item => {
        if (!item.copilot_ide_code_completions) {
            item.copilot_ide_code_completions = { editors: [], total_engaged_users: 0, languages: [] };
        }
        item.copilot_ide_code_completions.editors?.forEach((editor) => {
            editor.models?.forEach((model) => {
                if (!model.languages) {
                    model.languages = [];
                }
            });
        });
        return item as CopilotMetrics;
    });
};