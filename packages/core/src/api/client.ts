import {
  RenderRequest,
  RenderResponse,
  ParseResponse,
  HealthResponse,
} from './types';

export class MathImgClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async render(request: RenderRequest): Promise<RenderResponse> {
    const response = await fetch(`${this.baseUrl}/api/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Render failed: ${error}`);
    }

    return response.json();
  }

  async parse(svgContent: string): Promise<ParseResponse> {
    const response = await fetch(`${this.baseUrl}/api/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/svg+xml',
      },
      body: svgContent,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Parse failed: ${error}`);
    }

    return response.json();
  }

  async health(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/api/health`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Health check failed: ${error}`);
    }

    return response.json();
  }
}
