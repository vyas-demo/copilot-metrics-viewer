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
        // usage is the new API format
        const usageData = ensureCopilotMetrics(dataJson);
        // metrics is the old API format
        const metricsData = convertToMetrics(usageData);

        logger.info('Using mocked data');
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