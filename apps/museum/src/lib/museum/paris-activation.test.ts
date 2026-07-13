import { describe, expect, it } from 'vitest';
import { museumNavigationGraph, type SceneObjectPlacement } from '$lib/content/scene';
import {
  getParisAssetActivation,
  isSceneObjectEnabled,
  type MuseumNavigationStatus
} from './paris-activation';

function activation(status: MuseumNavigationStatus) {
  return getParisAssetActivation(status, museumNavigationGraph);
}

describe('Paris asset activation parity', () => {
  it('keeps all real models and lights dormant before Departure', () => {
    expect(
      activation({
        currentRoomId: 'entrance',
        activeNodeId: 'entrance-start',
        targetNodeId: null
      })
    ).toEqual({
      routePassesParis: false,
      preloadParisHero: false,
      loadParisSalon: false
    });
  });

  it('uses the hero gate only for the Paris piano placement', () => {
    const piano = {
      id: 'piano',
      roomId: 'paris',
      assetId: 'paris-grand-piano',
      fallback: 'piano',
      position: [0, 0, 0],
      rotation: [0, 0, 0]
    } satisfies SceneObjectPlacement;
    const chair = {
      id: 'chair',
      roomId: 'paris',
      assetId: 'paris-salon-chair',
      fallback: 'chair',
      position: [0, 0, 0],
      rotation: [0, 0, 0]
    } satisfies SceneObjectPlacement;
    const futureRoomObject = {
      id: 'future',
      roomId: 'workshop',
      assetId: 'paris-book',
      fallback: 'books',
      position: [0, 0, 0],
      rotation: [0, 0, 0]
    } satisfies SceneObjectPlacement;

    expect(
      isSceneObjectEnabled(piano, { preloadParisHero: true, loadParisSalon: false })
    ).toBe(true);
    expect(
      isSceneObjectEnabled(chair, { preloadParisHero: true, loadParisSalon: false })
    ).toBe(false);
    expect(
      isSceneObjectEnabled(futureRoomObject, {
        preloadParisHero: false,
        loadParisSalon: false
      })
    ).toBe(true);
  });

  it('preloads only the piano and light rig at stable Departure', () => {
    expect(
      activation({
        currentRoomId: 'departure',
        activeNodeId: 'departure-corridor',
        targetNodeId: null
      })
    ).toEqual({
      routePassesParis: false,
      preloadParisHero: true,
      loadParisSalon: false
    });
  });

  it('enables the whole salon as soon as a route crosses Paris', () => {
    expect(
      activation({
        currentRoomId: 'departure',
        activeNodeId: 'departure-corridor',
        targetNodeId: 'workshop-desk'
      })
    ).toEqual({
      routePassesParis: true,
      preloadParisHero: true,
      loadParisSalon: true
    });
  });

  it('keeps the salon active throughout a transition leaving Paris', () => {
    expect(
      activation({
        currentRoomId: 'paris',
        activeNodeId: 'paris-seat',
        targetNodeId: 'workshop-desk'
      })
    ).toEqual({
      routePassesParis: true,
      preloadParisHero: true,
      loadParisSalon: true
    });
  });

  it('does not activate Paris for a route that avoids it', () => {
    expect(
      activation({
        currentRoomId: 'entrance',
        activeNodeId: 'entrance-start',
        targetNodeId: 'departure-corridor'
      })
    ).toEqual({
      routePassesParis: false,
      preloadParisHero: false,
      loadParisSalon: false
    });
  });
});
