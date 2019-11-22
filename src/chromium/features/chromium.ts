/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { assert } from '../../helper';
import { CDPSession, Connection } from '../Connection';
import { Page } from '../Page';
import { readProtocolStream } from '../protocolHelper';
import { Target } from '../Target';
import { Worker } from './workers';

export class Chromium {
  private _connection: Connection;
  private _client: CDPSession;
  private _recording = false;
  private _path = '';
  private _tracingClient: CDPSession | undefined;

  constructor(connection: Connection, client: CDPSession) {
    this._connection = connection;
    this._client = client;
  }

  createBrowserCDPSession(): Promise<CDPSession> {
    return this._connection.createBrowserSession();
  }

  createCDPSession(target: Target): Promise<CDPSession> {
    return target._sessionFactory();
  }

  serviceWorker(target: Target): Promise<Worker | null> {
    return target._worker();
  }

  async startTracing(page: Page | undefined, options: { path?: string; screenshots?: boolean; categories?: string[]; } = {}) {
    assert(!this._recording, 'Cannot start recording trace while already recording trace.');
    this._tracingClient = page ? page._client : this._client;

    const defaultCategories = [
      '-*', 'devtools.timeline', 'v8.execute', 'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame', 'toplevel',
      'blink.console', 'blink.user_timing', 'latencyInfo', 'disabled-by-default-devtools.timeline.stack',
      'disabled-by-default-v8.cpu_profiler', 'disabled-by-default-v8.cpu_profiler.hires'
    ];
    const {
      path = null,
      screenshots = false,
      categories = defaultCategories,
    } = options;

    if (screenshots)
      categories.push('disabled-by-default-devtools.screenshot');

    this._path = path;
    this._recording = true;
    await this._tracingClient.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      categories: categories.join(',')
    });
  }

  async stopTracing(): Promise<Buffer> {
    assert(this._tracingClient, 'Tracing was not started.');
    let fulfill: (buffer: Buffer) => void;
    const contentPromise = new Promise<Buffer>(x => fulfill = x);
    this._tracingClient.once('Tracing.tracingComplete', event => {
      readProtocolStream(this._tracingClient, event.stream, this._path).then(fulfill);
    });
    await this._tracingClient.send('Tracing.end');
    this._recording = false;
    return contentPromise;
  }

  wsEndpoint(): string {
    return this._connection.url();
  }
}