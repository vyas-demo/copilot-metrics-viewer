import type FetchError from 'ofetch';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface GitHubTeam {
  id: number;
  node_id: string;
  name: string;
  slug: string;
  description: string | null;
  privacy: string;
  permission: string;
  url: string;
  html_url: string;
  members_url: string;
  repositories_url: string;
}

export default defineEventHandler(async (event) => {
  const logger = console;
  const config = useRuntimeConfig(event);
  
  // Only org scope supports team listing
  if (event.context.scope !== 'org') {
    return new Response('Teams can only be listed for organization scope', { status: 400 });
  }

  const apiUrl = `https://api.github.com/orgs/${event.context.org}/teams`;
  const mockedDataPath = resolve('public/mock-data/organization_teams_response_sample.json');

  if (config.public.isDataMocked && mockedDataPath) {
    try {
      const data = readFileSync(mockedDataPath, 'utf8');
      const dataJson = JSON.parse(data);
      logger.info('Using mocked teams data');
      return dataJson;
    } catch (error) {
      // If mock data doesn't exist, return empty array
      logger.info('No mock teams data found, returning empty array');
      return [];
    }
  }

  if (!event.context.headers.has('Authorization')) {
    logger.error('No Authentication provided');
    return new Response('No Authentication provided', { status: 401 });
  }

  const perPage = 100;
  let page = 1;
  let allTeams: GitHubTeam[] = [];

  logger.info(`Fetching teams data from ${apiUrl}`);

  try {
    while (true) {
      const response = await $fetch(apiUrl, {
        headers: event.context.headers,
        params: {
          per_page: perPage,
          page: page
        }
      }) as GitHubTeam[];

      if (response.length === 0) {
        break;
      }

      allTeams = allTeams.concat(response);
      
      // If we got less than perPage results, we've reached the end
      if (response.length < perPage) {
        break;
      }
      
      page++;
    }

    logger.info(`Successfully fetched ${allTeams.length} teams`);
    return allTeams;

  } catch (error: unknown) {
    const fetchError = error as FetchError;
    logger.error('Error fetching teams data:', fetchError);
    return new Response('Error fetching teams data. Error: ' + fetchError, { 
      status: fetchError.statusCode || 500 
    });
  }
});