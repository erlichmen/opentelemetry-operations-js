// Copyright 2020 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import * as types from '@opentelemetry/api';
import { TraceFlags } from '@opentelemetry/api';
import { VERSION as CORE_VERSION } from '@opentelemetry/core';
import { Resource } from '@opentelemetry/resources';
import { ReadableSpan } from '@opentelemetry/tracing';
import * as assert from 'assert';
import { getReadableSpanTransformer } from '../src/transform';
import { LinkType, Span } from '../src/types';
import { VERSION } from '../src/version';

describe('transform', () => {
  let readableSpan: ReadableSpan;
  let transformer: (readableSpan: ReadableSpan) => Span;
  let spanContext: types.SpanContext;

  beforeEach(() => {
    spanContext = {
      traceId: 'd4cda95b652f4a1592b449d5929fda1b',
      spanId: '6e0c63257de34c92',
      traceFlags: TraceFlags.NONE,
      isRemote: true,
    };

    transformer = getReadableSpanTransformer('project-id');

    readableSpan = {
      attributes: {},
      duration: [32, 800000000],
      startTime: [1566156729, 709],
      endTime: [1566156731, 709],
      ended: true,
      events: [],
      kind: types.SpanKind.CLIENT,
      links: [],
      name: 'my-span',
      spanContext,
      status: { code: types.CanonicalCode.OK },
      resource: new Resource({
        service: 'ui',
        version: 1,
        cost: 112.12,
      }),
      instrumentationLibrary: { name: 'default', version: '0.0.1' },
    };
  });

  it('should transform spans', () => {
    const result = transformer(readableSpan);

    assert.deepStrictEqual(result, {
      attributes: {
        attributeMap: {
          project_id: { stringValue: { value: 'project-id' } },
          'g.co/agent': {
            stringValue: {
              value: `opentelemetry-js ${CORE_VERSION}; google-cloud-trace-exporter ${VERSION}`,
            },
          },
          cost: { intValue: '112' },
          service: { stringValue: { value: 'ui' } },
          version: { intValue: '1' },
        },
        droppedAttributesCount: 0,
      },
      displayName: { value: 'my-span' },
      links: { link: [] },
      endTime: { seconds: 1566156731, nanos: 709 },
      startTime: { seconds: 1566156729, nanos: 709 },
      name:
        'projects/project-id/traces/d4cda95b652f4a1592b449d5929fda1b/spans/6e0c63257de34c92',
      spanId: '6e0c63257de34c92',
      status: { code: 0 },
      timeEvents: { timeEvent: [] },
      sameProcessAsParentSpan: { value: false },
    });
  });
  it('should transform spans with parent', () => {
    /* tslint:disable-next-line:no-any */
    (readableSpan as any).parentSpanId = '3e0c63257de34c92';
    const result = transformer(readableSpan);
    assert.deepStrictEqual(result.parentSpanId, '3e0c63257de34c92');
  });

  it('should transform spans without parent', () => {
    const result = transformer(readableSpan);
    assert.deepStrictEqual(result.parentSpanId, undefined);
  });

  it('should transform remote spans', () => {
    const remote = transformer(readableSpan);
    assert.deepStrictEqual(remote.sameProcessAsParentSpan, { value: false });
  });

  it('should transform local spans', () => {
    readableSpan.spanContext.isRemote = false;
    const local = transformer(readableSpan);
    assert.deepStrictEqual(local.sameProcessAsParentSpan, { value: true });
  });

  it('should transform attributes', () => {
    readableSpan.attributes.testBool = true;
    readableSpan.attributes.testInt = 3;
    readableSpan.attributes.testString = 'str';

    const result = transformer(readableSpan);

    assert.deepStrictEqual(result.attributes!.attributeMap!.testBool, {
      boolValue: true,
    });
    assert.deepStrictEqual(result.attributes!.attributeMap!.testInt, {
      intValue: '3',
    });
    assert.deepStrictEqual(result.attributes!.attributeMap!.testString, {
      stringValue: { value: 'str' },
    });
    assert.deepStrictEqual(result.attributes!.droppedAttributesCount, 0);
  });

  it('should drop unknown attribute types', () => {
    readableSpan.attributes.testUnknownType = { message: 'dropped' };
    const result = transformer(readableSpan);
    assert.deepStrictEqual(result.attributes!.droppedAttributesCount, 1);
    assert.deepStrictEqual(
      Object.keys(result.attributes!.attributeMap!).length,
      5
    );
  });

  it('should transform links', () => {
    readableSpan.links.push({
      context: {
        traceId: 'a4cda95b652f4a1592b449d5929fda1b',
        spanId: '3e0c63257de34c92',
      },
    });

    const result = transformer(readableSpan);

    assert.deepStrictEqual(result.links, {
      link: [
        {
          attributes: {
            attributeMap: {},
            droppedAttributesCount: 0,
          },
          traceId: 'a4cda95b652f4a1592b449d5929fda1b',
          spanId: '3e0c63257de34c92',
          type: LinkType.UNSPECIFIED,
        },
      ],
    });
  });

  it('should transform links with attributes', () => {
    readableSpan.links.push({
      context: {
        traceId: 'a4cda95b652f4a1592b449d5929fda1b',
        spanId: '3e0c63257de34c92',
      },
      attributes: {
        testAttr: 'value',
        droppedAttr: {},
      },
    });

    const result = transformer(readableSpan);

    assert.deepStrictEqual(result.links, {
      link: [
        {
          attributes: {
            attributeMap: {
              testAttr: {
                stringValue: {
                  value: 'value',
                },
              },
            },
            droppedAttributesCount: 1,
          },
          traceId: 'a4cda95b652f4a1592b449d5929fda1b',
          spanId: '3e0c63257de34c92',
          type: LinkType.UNSPECIFIED,
        },
      ],
    });
  });

  it('should transform events', () => {
    readableSpan.events.push({
      name: 'something happened',
      time: [1566156729, 809],
    });

    const result = transformer(readableSpan);

    assert.deepStrictEqual(result.timeEvents, {
      timeEvent: [
        {
          annotation: {
            attributes: {
              attributeMap: {},
              droppedAttributesCount: 0,
            },
            description: {
              value: 'something happened',
            },
          },
          time: { seconds: 1566156729, nanos: 809 },
        },
      ],
    });
  });

  it('should transform events with attributes', () => {
    readableSpan.events.push({
      name: 'something happened',
      attributes: {
        error: true,
        dropped: {},
      },
      time: [1566156729, 809],
    });

    const result = transformer(readableSpan);

    assert.deepStrictEqual(result.timeEvents, {
      timeEvent: [
        {
          annotation: {
            attributes: {
              attributeMap: {
                error: {
                  boolValue: true,
                },
              },
              droppedAttributesCount: 1,
            },
            description: {
              value: 'something happened',
            },
          },
          time: { seconds: 1566156729, nanos: 809 },
        },
      ],
    });
  });
});
