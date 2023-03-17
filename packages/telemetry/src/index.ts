import type { Span, Tracer, Context } from '@opentelemetry/api'
import type { BasicTracerProvider, SimpleSpanProcessor, BatchSpanProcessor, SpanExporter } from '@opentelemetry/sdk-trace-base'
import type { DetectorSync } from '@opentelemetry/resources'

// import { BatchSpanProcessor, SimpleSpanProcessor, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import openTelemetry/*, { diag, DiagConsoleLogger, DiagLogLevel }*/ from '@opentelemetry/api'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { Resource, detectResourcesSync } from '@opentelemetry/resources'

const types = ['child', 'root'] as const

type AttachType = typeof types[number];

export type startSpanType = {
  name: string
  attachType?: AttachType
  active?: boolean
}

export class Telemetry {
  tracer: Tracer
  spans: {[key: string]: Span}
  spanQueue: Span[]
  rootContext: Context | undefined
  provider: BasicTracerProvider

  private constructor (tracer: Tracer, provider: BasicTracerProvider, rootContext: Context | undefined) {
    this.tracer = tracer
    this.provider = provider
    this.rootContext = rootContext
    this.spans = {}
    this.spanQueue = []
  }

  static init ({
    namespace,
    Provider,
    detectors,
    rootContextObject,
    version,
    SpanProcessor,
    exporter,
  }: {
    namespace: string | undefined
    Provider: typeof BasicTracerProvider
    detectors: DetectorSync[]
    rootContextObject?: {traceparent: string}
    version: string
    SpanProcessor: typeof SimpleSpanProcessor | typeof BatchSpanProcessor
    exporter: SpanExporter
  }) {
    // For troubleshooting, set the log level to DiagLogLevel.DEBUG
    // diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL)

    const resource = Resource.default().merge(
      new Resource({
        [ SemanticResourceAttributes.SERVICE_NAME ]: 'cypress-app',
        [ SemanticResourceAttributes.SERVICE_NAMESPACE ]: namespace,
        [ SemanticResourceAttributes.SERVICE_VERSION ]: version,
      }),
    )

    const provider = new Provider({ resource: resource.merge(detectResourcesSync({ detectors })) })

    // Setup the console exporter
    provider.addSpanProcessor(new SpanProcessor(exporter))

    // Initialize the provider
    provider.register()

    const tracer = openTelemetry.trace.getTracer('cypress', version)

    // store off the root context to apply to new spans
    let rootContext

    if (rootContextObject) {
      rootContext = openTelemetry.propagation.extract(openTelemetry.context.active(), rootContextObject)
    }

    return new Telemetry(tracer, provider, rootContext)
  }

  startSpan ({
    name,
    attachType = 'child',
    active = false,
  }: {
    name: string
    attachType?: AttachType
    active?: boolean
  }): Span | undefined {
    // TODO: what do we do with duplicate names?
    // if (spans[name]) {
    //   throw 'Span name already defined'
    // }

    let span: Span

    // TODO: Do we need to be able to attach to a provided context or attach as a sibling?

    if (attachType === 'root' || this.spanQueue.length < 1) {
      if (this.rootContext) {
        span = this.tracer.startSpan(name, {}, this.rootContext)
      } else {
        span = this.tracer.startSpan(name)
      }
    } else { // attach type must be child
      const ctx = openTelemetry.trace.setSpan(openTelemetry.context.active(), this.spanQueue[this.spanQueue.length - 1]!)

      span = this.tracer.startSpan(name, {}, ctx)
    }

    this.spans[name] = span

    if (active) {
      const _end = span.end

      // override the end function to allow us to pop the span off the queue if found.
      span.end = (endTime) => {
      // find the span in the queue by spanId
        const index = this.spanQueue.findIndex((element: Span) => {
          return element.spanContext().spanId === span.spanContext().spanId
        })

        // if span exists, remove it from the queue
        if (index > -1) {
          this.spanQueue.splice(index, 1)
        }

        _end.call(span, endTime)
      }

      this.spanQueue.push(span)
    }

    // console.log('startSpan', name, attachType, 'active:', active, 'span:', span.spanContext().spanId)

    return span
  }

  getSpan (name: string): Span | undefined {
    return this.spans[name]
  }

  findActiveSpan (fn: any): Span | undefined {
    return this.spanQueue.find(fn)
  }

  endActiveSpanAndChildren (span: Span) {
    const startIndex = this.spanQueue.findIndex((element: Span) => {
      return element.spanContext().spanId === span.spanContext().spanId
    })

    this.spanQueue.slice(startIndex).forEach((spanToEnd) => {
      span.setAttribute('spanEndedPrematurely', true)
      spanToEnd?.end()
    })
  }

  getActiveContextObject (): {} {
    const rootSpan = this.spanQueue[this.spanQueue.length - 1]

    if (!rootSpan) {
      return {}
    }

    const ctx = openTelemetry.trace.setSpan(openTelemetry.context.active(), rootSpan)
    let myCtx = {}

    openTelemetry.propagation.inject(ctx, myCtx)

    return myCtx
  }

  forceFlush (): Promise<void> {
    return this.provider.forceFlush()
  }
}

export class TelemetryNoop {
  startSpan () {}
  getSpan () {}
  findActiveSpan () {}
  endActiveSpanAndChildren () {}
  getActiveContextObject () {
    return {}
  }
  forceFlush () {
    return Promise.resolve()
  }
}
