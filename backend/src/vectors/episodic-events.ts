export interface EpisodicEvent {
    id: string;
    text: string;
    tick: number;
    location: string;
    participants: string[];
    importance: number;
    type: string;
    vector: number[];
}
