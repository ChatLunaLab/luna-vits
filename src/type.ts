export interface VitsConfig<
    T extends 'GPT-SoVITS2' | 'vits-simple-api' | 'gradio' | 'fish-audio' =
        | 'GPT-SoVITS2'
        | 'vits-simple-api'
        | 'gradio'
        | 'fish-audio'
> {
    name?: string
    type: T
    headers?: Record<string, string>
    url: string
    enabled?: boolean
    config: this extends { type: infer T }
        ? T extends 'GPT-SoVITS2'
            ? GPTSoVITS2Config
            : T extends 'vits-simple-api'
              ? VitsSimpleApiConfig
              : T extends 'fish-audio'
                ? FishAudioConfig
                : GradioConfig
        : GradioConfig
    speakers: (this extends { type: infer T }
        ? T extends 'GPT-SoVITS2'
            ? GPTSoVITS2Speaker
            : T extends 'vits-simple-api'
              ? VitsSimpleApiSpeaker
              : T extends 'fish-audio'
                ? FishAudioSpeaker
                : GradioSpeaker
        : BaseSpeaker)[]
}

export type Speaker = VitsConfig['speakers'][number]

export interface VitsSimpleApiConfig {
    auto_pull_speaker?: boolean
    api_key?: string
}

export interface FishAudioConfig {
    api_key?: string
}

export interface GPTSoVITS2Speaker extends BaseSpeaker, GPTSoVITS2Config {
    name: string

    gpt_weights?: string
    sovits_weights?: string
}

export interface VitsSimpleApiSpeaker
    extends BaseSpeaker,
        Record<string, string | boolean | number | string[]> {
    name: string
    type: 'VITS' | 'W2V2-VITS' | 'BERT-VITS2' | 'GPT-SOVITS'
    languages: string[]
    id: number

    // GPT-SoVITS 的配置
    segment_size?: number
    batch_size?: number
    temperature?: number
    top_p?: number
    speed?: number
    top_k?: number
    preset?: string
    prompt_text?: string
    prompt_lang?: string
    reference_audio?: string

    // BERT-VITS2 / VITS / W2V2-VITS 的配置
    noise?: number
    noise_w?: number
    sdp_ratio?: number
    text_prompt?: string

    // W2V2-VITS 的配置
    emotion?: number

    format?: string
}

export interface BaseSpeaker {
    name: string
}

export interface GradioSpeaker
    extends BaseSpeaker,
        Record<string, string | number | boolean | string[]> {
    fn_index: string | number
}

export interface GPTSoVITS2Request {
    ref_audio_path: string
    aux_ref_audio_paths: string[]
    prompt_text: string
    prompt_lang: string
    top_k?: number
    top_p?: number
    temperature?: number
    text_split_method: string
    batch_size: number
    batch_threshold?: number
    split_bucket?: boolean
    speed_factor?: number
    text: string
    text_lang: string
    seed?: number
    media_type?: string
}

export interface GPTSoVITS2Config
    extends Omit<GPTSoVITS2Request, 'text' | 'text_lang'> {}

export interface GradioConfig
    extends Record<string, string | boolean | number | string[]> {
    type: string
    fn_index: string | number
    languages?: string[]
    auto_pull_speaker?: boolean
}

export interface FishAudioSpeaker
    extends BaseSpeaker,
        Omit<FishAudioRequest, 'text'> {}

export interface FishAudioRequest {
    text: string
    chunk_length?: number // Annotated[int, conint(ge=100, le=300, strict=True)] = 200
    format?: 'wav' | 'pcm' | 'mp3'
    mp3_bitrate?: 64 | 128 | 192
    languages?: string[]
    reference_id?: string | null
    normalize?: boolean
    latency?: 'normal' | 'balanced'
}

// ... existing code ...
