import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';

describe('PlanningController claimJourney user id resolution', () => {
  let controller: PlanningController;
  let claimJourney: jest.Mock;

  beforeEach(() => {
    claimJourney = jest.fn().mockResolvedValue({ tripId: 'trip-1' });
    controller = new PlanningController({
      claimJourney,
    } as unknown as PlanningService);
  });

  it('uses JwtStrategy userId (not missing id) when claiming', async () => {
    const guestJourney = { id: 'journey-1' };
    await controller.claimJourney('journey-1', {
      user: { userId: 'user-canonical-123', email: 'a@b.com', role: 'USER' },
      guestJourney,
    });

    expect(claimJourney).toHaveBeenCalledWith(
      'journey-1',
      'user-canonical-123',
      guestJourney,
    );
  });

  it('falls back to sub then id for legacy payloads', async () => {
    await controller.claimJourney('journey-2', {
      user: { sub: 'user-from-sub' },
      guestJourney: null,
    });
    expect(claimJourney).toHaveBeenCalledWith(
      'journey-2',
      'user-from-sub',
      null,
    );

    claimJourney.mockClear();
    await controller.claimJourney('journey-3', {
      user: { id: 'user-from-id' },
      guestJourney: null,
    });
    expect(claimJourney).toHaveBeenCalledWith(
      'journey-3',
      'user-from-id',
      null,
    );
  });
});
