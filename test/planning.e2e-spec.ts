import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GuestJourneyStatus, BudgetLevel } from '@prisma/client';
import { PlanningInterest } from '../src/planning/enums/planning-interests.enum';

describe('Planning Sessions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let createdJourneyId: string;
  let createdGuestToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Cleanup created test guest journeys
    if (createdJourneyId) {
      await prisma.guestJourney.deleteMany({
        where: { id: createdJourneyId },
      });
    }
    await app.close();
  });

  it('POST /planning-sessions -> should create session and return guestToken ONCE', async () => {
    const res = await request(app.getHttpServer())
      .post('/planning-sessions')
      .send({ answersVersion: 1, initialStep: 1 })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.guestToken).toBeDefined();
    expect(res.body.status).toBe(GuestJourneyStatus.COLLECTING);
    expect(res.body.currentStep).toBe(1);

    createdJourneyId = res.body.id;
    createdGuestToken = res.body.guestToken;

    // Verify DB stores hash, NOT raw token
    const dbEntry = await prisma.guestJourney.findUnique({
      where: { id: createdJourneyId },
    });
    expect(dbEntry).toBeDefined();
    expect(dbEntry?.guestTokenHash).not.toBe(createdGuestToken);
  });

  it('GET /planning-sessions/:id -> should reject without X-Guest-Token (401)', async () => {
    await request(app.getHttpServer())
      .get(`/planning-sessions/${createdJourneyId}`)
      .expect(401);
  });

  it('GET /planning-sessions/:id -> should reject with invalid X-Guest-Token (404/401)', async () => {
    await request(app.getHttpServer())
      .get(`/planning-sessions/${createdJourneyId}`)
      .set('X-Guest-Token', 'invalid-token-1234567890')
      .expect(404);
  });

  it('GET /planning-sessions/:id -> should succeed with valid X-Guest-Token and NOT expose guestToken', async () => {
    const res = await request(app.getHttpServer())
      .get(`/planning-sessions/${createdJourneyId}`)
      .set('X-Guest-Token', createdGuestToken)
      .expect(200);

    expect(res.body.id).toBe(createdJourneyId);
    expect(res.body.guestToken).toBeUndefined(); // Crucial: never exposed again
    expect(res.body.guestTokenHash).toBeUndefined();
  });

  it('PATCH /planning-sessions/:id -> should update draft progress incrementally', async () => {
    const destinations = [
      {
        name: 'Roma',
        city: 'Roma',
        country: 'Itália',
        arrivalDate: '2026-07-25',
        arrivalTime: '11:00',
        departureDate: '2026-07-28',
        departureTime: '19:00',
        order: 1,
      },
    ];

    const res = await request(app.getHttpServer())
      .patch(`/planning-sessions/${createdJourneyId}`)
      .set('X-Guest-Token', createdGuestToken)
      .send({
        currentStep: 2,
        destinations,
        travelers: { adults: 2, children: 1, elders: 0 },
      })
      .expect(200);

    expect(res.body.currentStep).toBe(2);
    expect(res.body.destinations).toHaveLength(1);
    expect(res.body.travelers).toEqual({ adults: 2, children: 1, elders: 0 });
  });

  it('POST /planning-sessions/:id/finalize -> should reject incomplete questionnaire (400 PLANNING_INCOMPLETE)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/planning-sessions/${createdJourneyId}/finalize`)
      .set('X-Guest-Token', createdGuestToken)
      .expect(400);

    expect(res.body.code).toBe('PLANNING_INCOMPLETE');
  });

  it('PATCH + POST /planning-sessions/:id/finalize -> should finalize complete questionnaire and lock draft', async () => {
    // 1. Complete remaining sections
    await request(app.getHttpServer())
      .patch(`/planning-sessions/${createdJourneyId}`)
      .set('X-Guest-Token', createdGuestToken)
      .send({
        interests: [PlanningInterest.GASTRONOMY, PlanningInterest.NATURE],
        activityWindow: { startTime: '09:00', endTime: '18:30' },
        budgetLevel: BudgetLevel.MEDIUM,
      })
      .expect(200);

    // 2. Finalize
    const finalizeRes = await request(app.getHttpServer())
      .post(`/planning-sessions/${createdJourneyId}/finalize`)
      .set('X-Guest-Token', createdGuestToken)
      .expect(200);

    expect(finalizeRes.body.status).toBe(GuestJourneyStatus.READY_TO_GENERATE);
    expect(finalizeRes.body.currentStep).toBe(6);

    // 3. Verify further PATCH is rejected with 400 PLANNING_JOURNEY_LOCKED
    const patchRes = await request(app.getHttpServer())
      .patch(`/planning-sessions/${createdJourneyId}`)
      .set('X-Guest-Token', createdGuestToken)
      .send({ currentStep: 1 })
      .expect(400);

    expect(patchRes.body.code).toBe('PLANNING_JOURNEY_LOCKED');
  });
});
